import { type Address, type PublicClient, type WalletClient } from "viem";
import { dripCoreAbi, rewardVaultAbi, listings } from "@drip-markets/sdk";
import type { KeeperConfig } from "./config.js";
import type { HolderIndex } from "./holders.js";
import { log } from "./log.js";

/** Seconds in the year the posted rates are quoted against. */
const YEAR = 365n * 24n * 60n * 60n;
/** Rates are given to two decimals, so carry them as basis points of a percent. */
const RATE_SCALE = 10_000n;

const swapAdapterPriceAbi = [
  {
    type: "function",
    name: "priceUsdg",
    stateMutability: "view",
    inputs: [{ name: "stockToken", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface Rated {
  token: Address;
  symbol: string;
  /** rewardRatePct * 10_000, e.g. 0.62% -> 6200. */
  rateBps: bigint;
  /** USDG per whole token, 6 decimals. Null when the feed will not answer. */
  priceUsdg: bigint | null;
  decimals: bigint;
}

/**
 * The tokens carrying a posted reward rate, priced.
 *
 * A token whose feed has gone quiet is carried with a null price and then skipped for
 * this cycle rather than valued at zero. Zero would silently pay its holders nothing
 * while paying everyone else in full, which is a worse failure than paying nobody and
 * saying so: the accrual is not lost, it lands next cycle once the feed answers.
 */
async function ratedTokens(config: KeeperConfig, client: PublicClient): Promise<Rated[]> {
  const universe = listings[config.chain.id];
  if (!universe) return [];

  const rows = universe.tokens.filter((t) => t.enabled && typeof t.rewardRatePct === "number");

  return Promise.all(
    rows.map(async (t) => {
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
        rateBps: BigInt(Math.round((t.rewardRatePct ?? 0) * Number(RATE_SCALE))),
        priceUsdg,
        decimals: 18n,
      };
    })
  );
}

/**
 * When the last distribution happened, read back off the chain.
 *
 * The keeper keeps no state of its own — Railway recycles the disk and a restart must
 * not re-pay a window that was already paid. The block timestamp of the most recent
 * Distributed log is that state, and it is authoritative: if the distribution landed,
 * the log exists; if it did not, it does not. Before the first distribution there is
 * nothing to read, so REWARD_EPOCH_START names where accrual begins.
 */
async function lastDistributionAt(
  config: KeeperConfig,
  client: PublicClient,
  head: bigint
): Promise<bigint | null> {
  const vault = config.deployment.rewardVault;
  if (!vault) return null;

  const event = rewardVaultAbi.find((e) => e.type === "event" && e.name === "Distributed") as never;

  // Walk back from the head rather than forward from the deploy: the answer is almost
  // always in the last few thousand blocks, and this is a per cycle read.
  let to = head;
  const floor = config.startBlock;
  while (to >= floor) {
    const from = to - config.logChunk + 1n < floor ? floor : to - config.logChunk + 1n;
    const logs = await client.getLogs({ address: vault, event, fromBlock: from, toBlock: to });
    if (logs.length > 0) {
      // The event is cast to never to satisfy getLogs' overload, which makes the
      // entries never too. The block number is the only field this needs.
      const last = logs[logs.length - 1] as unknown as { blockNumber: bigint };
      const block = await client.getBlock({ blockNumber: last.blockNumber });
      return block.timestamp;
    }
    if (from === floor) break;
    to = from - 1n;
  }
  return null;
}

/**
 * Hand out the reward pot, pro rata by the dollar value of what people have deposited.
 *
 * Each stock carries a posted yearly rate. A holder accrues, per stock, on the balance
 * they had at the START of the window — not the end, so a deposit made two minutes
 * before the keeper runs earns from the next window rather than collecting a full
 * period it was not present for.
 *
 * The pot is the hard bound. If the accruals add up to more than the vault holds
 * unallocated, every holder is scaled down by the same factor: the posted rate is what
 * Osinko intends to pay, the pot is what Osinko has, and the pot wins. That scaling is
 * also exactly the "split what is in the contract proportionally by deposit value"
 * behaviour, since each holder's accrual is their deposit value times its rate.
 *
 * The vault refuses to mint more YT than it holds USDG, so the worst a bug here can do
 * is revert. That is the invariant doing its job, not a reason to lean on it: this
 * function scales first and lets the contract be the second opinion.
 */
export async function distributeRewards(
  config: KeeperConfig,
  client: PublicClient,
  wallet: WalletClient,
  index: HolderIndex,
  head: { number: bigint; timestamp: bigint }
): Promise<void> {
  const vault = config.deployment.rewardVault;
  if (!vault) {
    log.info("no reward vault on this deployment; skipping rewards");
    return;
  }

  const since = (await lastDistributionAt(config, client, head.number)) ?? config.rewardEpochStart;
  if (since === null) {
    log.warn("no previous distribution and no REWARD_EPOCH_START; skipping rewards");
    return;
  }
  if (head.timestamp <= since) {
    log.info("reward window is empty", { since });
    return;
  }
  const elapsed = head.timestamp - since;

  const pot = (await client.readContract({
    address: vault,
    abi: rewardVaultAbi,
    functionName: "unallocated",
  })) as bigint;

  if (pot === 0n) {
    log.info("reward pot is empty; nothing to distribute", { windowSeconds: elapsed });
    return;
  }

  const tokens = (await ratedTokens(config, client)).filter((t) => t.rateBps > 0n);
  const quiet = tokens.filter((t) => t.priceUsdg === null).map((t) => t.symbol);
  if (quiet.length > 0) log.warn("skipping tokens with no price this cycle", { symbols: quiet });
  const priced = tokens.filter((t) => t.priceUsdg !== null);
  if (priced.length === 0) {
    log.warn("no priced tokens carry a reward rate; skipping rewards");
    return;
  }

  const holders = index.list();
  if (holders.length === 0) {
    log.info("no holders indexed; nothing to distribute");
    return;
  }

  // Balance at the START of the window, per holder per token. One read each; the
  // holder set is small and this is the number the accrual is actually owed on.
  const accrued = new Map<Address, bigint>();
  for (const holder of holders) {
    // Parallel across tokens, serial across holders: eleven reads at a time is polite
    // to the RPC, eleven times the holder count at once is not.
    const perToken = await Promise.all(
      priced.map(async (t) => {
        const balance = (await client.readContract({
          address: config.deployment.dripCore,
          abi: dripCoreAbi,
          functionName: "balanceOfAt",
          args: [holder, t.token, since],
        })) as bigint;
        if (balance === 0n) return 0n;

        // value(6dp) = balance(18dp) * price(6dp) / 1e18
        const valueUsdg = (balance * t.priceUsdg!) / 10n ** t.decimals;
        // Multiply before dividing, always: the rate is hundredths of a percent, so
        // the divisor is 100 * RATE_SCALE, with a year of seconds on top.
        return (valueUsdg * t.rateBps * elapsed) / (100n * RATE_SCALE * YEAR);
      })
    );
    const owed = perToken.reduce((a, b) => a + b, 0n);
    if (owed > 0n) accrued.set(holder, owed);
  }

  let total = [...accrued.values()].reduce((a, b) => a + b, 0n);
  if (total === 0n) {
    log.info("nothing accrued this window", { windowSeconds: elapsed, holders: holders.length });
    return;
  }

  // Scale to the pot when the posted rates outrun it. Integer division rounds every
  // holder down, so the scaled total is always at or under the pot, never over.
  let scaled = new Map(accrued);
  if (total > pot) {
    scaled = new Map([...accrued].map(([who, amount]) => [who, (amount * pot) / total]));
    log.warn("accruals exceed the pot; scaling every holder down", { accrued: total, pot });
  }

  const rows = [...scaled].filter(([, amount]) => amount > 0n);
  total = rows.reduce((a, [, amount]) => a + amount, 0n);

  if (total < config.rewardMinTotal) {
    // Do not distribute dust. Skipping writes no log, so the window does not advance
    // and this accrual is not lost — it simply keeps accumulating until it is worth
    // the gas. This is why the floor is safe to set generously.
    log.info("accrual below the distribution floor; letting it accumulate", {
      accrued: total,
      floor: config.rewardMinTotal,
      windowSeconds: elapsed,
    });
    return;
  }

  // One transaction, deliberately not chunked. The window this job pays for is derived
  // from the last Distributed log, so a run that landed batch one and reverted on batch
  // two would advance the window past holders who were never paid. All or nothing keeps
  // the accounting honest; when the holder set outgrows a single transaction the answer
  // is a claim tree, not a chunked loop that quietly drops people.
  if (rows.length > config.rewardMaxHolders) {
    log.error("too many holders for one distribution; refusing rather than paying some", {
      holders: rows.length,
      max: config.rewardMaxHolders,
      hint: "raise REWARD_MAX_HOLDERS only if a single distribute() still fits in a block",
    });
    return;
  }

  log.info("distributing rewards", {
    holders: rows.length,
    usdg: total,
    pot,
    windowSeconds: elapsed,
    since,
  });
  for (const [who, amount] of rows) log.info("  accrual", { holder: who, usdg: amount });

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
    log.info("rewards distributed", { holders: rows.length, usdg: total, hash });
  } catch (err) {
    // The likeliest cause by far is the keeper not holding DISTRIBUTOR_ROLE. Say the
    // whole reason rather than the first line of a revert nobody can read.
    log.error("distribution failed", {
      holders: rows.length,
      usdg: total,
      keeper: config.account.address,
      reason: (err as Error).message.split("\n")[0],
      hint: "the keeper needs DISTRIBUTOR_ROLE on the reward vault",
    });
  }
}
