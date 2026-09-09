import { type Address, type PublicClient, type WalletClient } from "viem";
import { dripCoreAbi, rewardVaultAbi, listings } from "@drip-markets/sdk";
import type { KeeperConfig } from "./config.js";
import type { HolderIndex } from "./holders.js";
import { log } from "./log.js";

const swapAdapterPriceAbi = [
  {
    type: "function",
    name: "priceUsdg",
    stateMutability: "view",
    inputs: [{ name: "stockToken", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface Priced {
  token: Address;
  symbol: string;
  /** USDG per whole token, 6 decimals. Null when the feed will not answer. */
  priceUsdg: bigint | null;
  /** The listing's rewardRatePct, times 10_000. Weights the split; see distributeRewards. */
  rateBps: bigint;
  decimals: bigint;
}

/** Rates are quoted to two decimals, so carry them as hundredths of a percent. */
const RATE_SCALE = 10_000;

/**
 * Every listed token, priced.
 *
 * A token whose feed has gone quiet is carried with a null price and then skipped.
 * Valuing it at zero would silently cut its holders out of the split while paying
 * everyone else in full, which is a worse failure than waiting: the pot is not spent,
 * so the next cycle divides the same money once the feed answers.
 */
async function pricedTokens(config: KeeperConfig, client: PublicClient): Promise<Priced[]> {
  const universe = listings[config.chain.id];
  if (!universe) return [];

  return Promise.all(
    universe.tokens
      .filter((t) => t.enabled)
      .map(async (t) => {
        let priceUsdg: bigint | null = null;
        try {
          priceUsdg = (await client.readContract({
            address: config.deployment.swapAdapter,
            abi: swapAdapterPriceAbi,
            functionName: "priceUsdg",
            args: [t.address as Address],
          })) as bigint;
        } catch {
          priceUsdg = null;
        }
        return {
          token: t.address as Address,
          symbol: t.symbol,
          priceUsdg,
          rateBps: BigInt(Math.round((t.rewardRatePct ?? 0) * RATE_SCALE)),
          decimals: 18n,
        };
      })
  );
}

/**
 * Split the pot by the largest remainder method, so the whole pot goes out.
 *
 * Plain `pot * share / total` floors every holder and leaves a few base units behind.
 * Those units would sit in the vault as permanently unallocated dust, and the next
 * cycle would try to divide them, floor everyone to zero, and find nothing to do —
 * for ever. Handing the remainder to the largest fractional parts costs a sort and
 * clears the pot exactly.
 */
function splitPot(pot: bigint, weights: [Address, bigint][]): [Address, bigint][] {
  const total = weights.reduce((a, [, w]) => a + w, 0n);
  if (total === 0n) return [];

  const rows = weights.map(([who, w]) => {
    const exact = pot * w;
    return { who, amount: exact / total, remainder: exact % total };
  });

  let handed = rows.reduce((a, r) => a + r.amount, 0n);
  // Descending remainder, then by address so a tie is decided the same way every run
  // rather than by whatever order the holder index happened to be in.
  rows.sort((a, b) => (b.remainder === a.remainder ? (a.who < b.who ? -1 : 1) : b.remainder > a.remainder ? 1 : -1));
  for (const row of rows) {
    if (handed >= pot) break;
    row.amount += 1n;
    handed += 1n;
  }

  return rows.filter((r) => r.amount > 0n).map((r) => [r.who, r.amount]);
}

/**
 * Hand out whatever USDG is sitting in the reward vault, split across holders by the
 * dollar value of what they have on deposit right now.
 *
 * The reward is discretionary: Osinko funds the vault when it chooses, and the whole
 * unallocated balance goes straight out on the next cycle. There is no accrual and no
 * clock — funding is the trigger, and the pot is the amount.
 *
 * Each position is weighted by `value x the listing's rate`, not by value alone. Value
 * alone would make every dollar on deposit earn exactly the same, whatever it was
 * deposited in, so the eleven different rates the app displays would all be the same
 * number in reality and the per stock figures would be decoration. Multiplying by the
 * rate is what makes them true: after any distribution, what a dollar of MSFT earned
 * over what a dollar of NVDA earned is precisely the ratio of their posted rates.
 *
 * If no token carries a rate the weighting falls back to plain value, which is the
 * same split with every rate equal.
 *
 * That makes the job naturally idempotent, which is the reason to prefer it over a
 * time based accrual. `unallocated()` is `usdgHeld - ytSupply`: once a distribution
 * lands, supply equals the balance and there is nothing left to hand out, so a restart,
 * a duplicated cycle or a crash between simulate and broadcast cannot pay twice. The
 * chain holds the whole of the state and the keeper holds none of it.
 */
export async function distributeRewards(
  config: KeeperConfig,
  client: PublicClient,
  wallet: WalletClient,
  index: HolderIndex
): Promise<void> {
  const vault = config.deployment.rewardVault;
  if (!vault) {
    log.info("no reward vault on this deployment; skipping rewards");
    return;
  }

  const pot = (await client.readContract({
    address: vault,
    abi: rewardVaultAbi,
    functionName: "unallocated",
  })) as bigint;

  if (pot === 0n) {
    log.info("reward pot is empty; nothing to distribute");
    return;
  }
  if (pot < config.rewardMinTotal) {
    log.info("reward pot below the distribution floor; leaving it to accumulate", {
      pot,
      floor: config.rewardMinTotal,
    });
    return;
  }

  const tokens = await pricedTokens(config, client);
  const quiet = tokens.filter((t) => t.priceUsdg === null).map((t) => t.symbol);
  if (quiet.length > 0) log.warn("skipping tokens with no price this cycle", { symbols: quiet });
  const priced = tokens.filter((t) => t.priceUsdg !== null);
  if (priced.length === 0) {
    log.warn("no token has a price this cycle; not distributing");
    return;
  }

  // Every rate zero means the listing carries none at all; weight by value alone
  // rather than by nothing, which would give every holder a weight of zero and split
  // the pot between nobody.
  const rated = priced.some((t) => t.rateBps > 0n);
  if (!rated) log.warn("no token carries a reward rate; weighting by deposit value alone");

  const holders = index.list();
  if (holders.length === 0) {
    log.info("no holders indexed; nothing to distribute");
    return;
  }

  // Deposit value per holder, right now. Parallel across tokens, serial across
  // holders: eleven reads at a time is polite to the RPC, eleven times the holder
  // count at once is not.
  const weights: [Address, bigint][] = [];
  for (const holder of holders) {
    const perToken = await Promise.all(
      priced.map(async (t) => {
        const balance = (await client.readContract({
          address: config.deployment.dripCore,
          abi: dripCoreAbi,
          functionName: "balanceOf",
          args: [holder, t.token],
        })) as bigint;
        if (balance === 0n) return 0n;
        // value(6dp) = balance(18dp) * price(6dp) / 1e18, then weighted by the rate.
        // Kept unscaled: only the ratio between weights matters to the split, so
        // dividing out the rate scale here would only throw away precision.
        const value = (balance * t.priceUsdg!) / 10n ** t.decimals;
        return rated ? value * t.rateBps : value;
      })
    );
    const weight = perToken.reduce((a, b) => a + b, 0n);
    if (weight > 0n) weights.push([holder, weight]);
  }

  if (weights.length === 0) {
    log.info("nobody has stock on deposit; not distributing", { pot, holders: holders.length });
    return;
  }

  const totalWeight = weights.reduce((a, [, w]) => a + w, 0n);
  const rows = splitPot(pot, weights);

  // One transaction, deliberately not chunked. A run that landed batch one and
  // reverted on batch two would leave the pot part spent and the rest to be divided
  // again on different weights — same money, two different splits. All or nothing.
  // When the holder set outgrows a single transaction the answer is a claim tree, not
  // a chunked loop that quietly pays some people.
  if (rows.length > config.rewardMaxHolders) {
    log.error("too many holders for one distribution; refusing rather than paying some", {
      holders: rows.length,
      max: config.rewardMaxHolders,
      hint: "raise REWARD_MAX_HOLDERS only if a single distribute() still fits in a block",
    });
    return;
  }

  log.info("distributing the reward pot", { pot, holders: rows.length, rateWeighted: rated });
  for (const [who, amount] of rows) {
    const weight = weights.find(([w]) => w === who)?.[1] ?? 0n;
    log.info("  share", {
      holder: who,
      usdg: amount,
      sharePct: totalWeight === 0n ? "0" : ((Number(weight) / Number(totalWeight)) * 100).toFixed(2),
    });
  }

  if (config.dryRun) {
    log.warn("DRY_RUN; not broadcasting the distribution");
    return;
  }

  try {
    const sim = await client.simulateContract({
      address: vault,
      abi: rewardVaultAbi,
      functionName: "distribute",
      args: [rows.map(([who]) => who), rows.map(([, amount]) => amount)],
      account: config.account,
    });
    const hash = await wallet.writeContract(sim.request);
    await client.waitForTransactionReceipt({ hash });
    log.info("reward pot distributed", { holders: rows.length, usdg: pot, hash });
  } catch (err) {
    // The likeliest cause by far is the keeper not holding DISTRIBUTOR_ROLE. Say the
    // whole reason rather than the first line of a revert nobody can read.
    log.error("distribution failed", {
      holders: rows.length,
      usdg: pot,
      keeper: config.account.address,
      reason: (err as Error).message.split("\n")[0],
      hint: "the keeper needs DISTRIBUTOR_ROLE on the reward vault",
    });
  }
}
