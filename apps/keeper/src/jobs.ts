import { erc20Abi, type Address, type PublicClient, type WalletClient } from "viem";
import { DividendStatus, dividendRegistryAbi, dripCoreAbi } from "@drip-markets/sdk";
import type { KeeperConfig } from "./config.js";
import type { HolderIndex } from "./holders.js";
import { log } from "./log.js";

interface Dividend {
  id: bigint;
  stockToken: Address;
  amountPerToken: bigint;
  exDate: bigint;
  payDate: bigint;
  status: number;
}

/** Every dividend the registry knows about, read once per cycle. */
async function readDividends(client: PublicClient, registry: Address): Promise<Dividend[]> {
  const count = await client.readContract({
    address: registry,
    abi: dividendRegistryAbi,
    functionName: "dividendCount",
  });

  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const raw = await Promise.all(
    ids.map((id) =>
      client.readContract({
        address: registry,
        abi: dividendRegistryAbi,
        functionName: "getDividend",
        args: [id],
      })
    )
  );

  return raw.map((d, i) => ({
    id: ids[i]!,
    stockToken: d.stockToken,
    amountPerToken: d.amountPerToken,
    exDate: BigInt(d.exDate),
    payDate: BigInt(d.payDate),
    status: Number(d.status),
  }));
}

/**
 * Pay holders as soon as their entitlement exists.
 *
 * activate is permissionless — anyone may call it for anyone — but nobody does it
 * automatically, and until it is called a holder in CASH_EARLY sees a dividend they
 * were promised early sitting undelivered. This is the job that makes "right now"
 * true. It costs gas and nothing else: the USDG comes from the vault, against a
 * receivable the issuer retires at settlement.
 */
export async function activateDue(
  config: KeeperConfig,
  client: PublicClient,
  wallet: WalletClient,
  index: HolderIndex,
  now: bigint
): Promise<void> {
  const core = config.deployment.dripCore;
  const dividends = await readDividends(client, config.deployment.dividendRegistry);
  const live = dividends.filter((d) => d.status === DividendStatus.DECLARED && d.exDate <= now);

  if (live.length === 0) {
    log.info("nothing to activate", { declared: dividends.length });
    return;
  }

  const holders = index.list();
  if (holders.length === 0) {
    // Distinct from "no dividends": there are entitlements to pay and nobody indexed
    // to pay them to. Almost always START_BLOCK set past the first deposit.
    log.warn("dividends are live but no holders are indexed", {
      live: live.length,
      startBlock: config.startBlock,
    });
    return;
  }

  for (const d of live) {

    const pending = await Promise.all(
      holders.map((user) =>
        client.readContract({
          address: core,
          abi: dripCoreAbi,
          functionName: "pendingEntitlement",
          args: [d.id, user],
        })
      )
    );
    const owed = holders.filter((_, i) => (pending[i] ?? 0n) > 0n);
    if (owed.length === 0) {
      // Everyone is already paid, or nobody held this token at its ex date. Both are
      // fine and neither should look like the job failing to run.
      log.info("no one owed", { dividend: d.id, checked: holders.length });
      continue;
    }

    log.info("activating", { dividend: d.id, holders: owed.length });
    if (config.dryRun) continue;

    // The batch is one transaction and one revert. activateBatch skips holders who
    // are already done or owed nothing, but an advance the pool cannot front reverts
    // inside _activate and takes every other holder in the batch down with it. So:
    // try the batch, and if it will not simulate, fall back to one holder at a time
    // so a single unfundable entitlement cannot block everyone else's payment.
    try {
      const { request } = await client.simulateContract({
        address: core,
        abi: dripCoreAbi,
        functionName: "activateBatch",
        args: [d.id, owed],
        account: config.account,
      });
      const hash = await wallet.writeContract(request);
      await client.waitForTransactionReceipt({ hash });
      log.info("activated batch", { dividend: d.id, holders: owed.length, hash });
    } catch (err) {
      log.warn("batch would revert, falling back to one at a time", {
        dividend: d.id,
        reason: (err as Error).message.split("\n")[0],
      });
      await activateIndividually(config, client, wallet, d.id, owed);
    }
  }
}

async function activateIndividually(
  config: KeeperConfig,
  client: PublicClient,
  wallet: WalletClient,
  dividendId: bigint,
  holders: readonly Address[]
): Promise<void> {
  let paid = 0;
  let skipped = 0;

  for (const user of holders) {
    try {
      const { request } = await client.simulateContract({
        address: config.deployment.dripCore,
        abi: dripCoreAbi,
        functionName: "activate",
        args: [dividendId, user],
        account: config.account,
      });
      const hash = await wallet.writeContract(request);
      await client.waitForTransactionReceipt({ hash });
      paid++;
    } catch (err) {
      skipped++;
      // Expected when the pool cannot front this holder's advance. Their entitlement
      // is untouched and claimable in full at the pay date, so this is a smaller
      // pool than the dividend needs, not a lost payment.
      log.warn("holder not activated", {
        dividend: dividendId,
        user,
        reason: (err as Error).message.split("\n")[0],
      });
    }
  }
  log.info("activated individually", { dividend: dividendId, paid, skipped });
}

/**
 * Pay the protocol what the issuer paid, on the pay date.
 *
 * This is the leg that costs real money: settleDividend pulls the full ex date
 * entitlement out of the keeper's wallet, retires the vault's receivable and makes
 * the holders who never took an advance claimable. It is off unless SETTLE_ENABLED
 * says otherwise, because a service that can move the float on its own should say so
 * out loud before it is allowed to.
 */
export async function settleDue(
  config: KeeperConfig,
  client: PublicClient,
  wallet: WalletClient,
  now: bigint
): Promise<void> {
  const core = config.deployment.dripCore;
  const dividends = await readDividends(client, config.deployment.dividendRegistry);
  const due = dividends.filter((d) => d.status === DividendStatus.DECLARED && d.payDate <= now);

  if (due.length === 0) {
    log.info("nothing to settle");
    return;
  }

  const owed = await Promise.all(
    due.map((d) =>
      client.readContract({
        address: core,
        abi: dripCoreAbi,
        functionName: "totalEntitlementFor",
        args: [d.id],
      })
    )
  );
  const total = owed.reduce((a, b) => a + b, 0n);
  const held = await client.readContract({
    address: config.deployment.usdg,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [config.account.address],
  });

  log.info("settlement due", { dividends: due.length, usdgRequired: total, usdgHeld: held });

  if (!config.settleEnabled) {
    log.warn("SETTLE_ENABLED is off; not settling", { usdgRequired: total });
    return;
  }
  if (config.dryRun) return;
  if (held < total) {
    // Loud, and every cycle until someone funds the wallet. Holders who took an
    // advance already have their money; this is the issuer's leg arriving late.
    log.error("keeper cannot cover settlement", {
      usdgRequired: total,
      usdgHeld: held,
      shortfall: total - held,
    });
    return;
  }

  for (const [i, d] of due.entries()) {
    const amount = owed[i]!;
    try {
      // Approve exactly this settlement rather than the batch total or an unbounded
      // allowance: if the process dies mid-loop, nothing is left standing approved.
      const approval = await client.simulateContract({
        address: config.deployment.usdg,
        abi: erc20Abi,
        functionName: "approve",
        args: [core, amount],
        account: config.account,
      });
      await client.waitForTransactionReceipt({ hash: await wallet.writeContract(approval.request) });

      const settle = await client.simulateContract({
        address: core,
        abi: dripCoreAbi,
        functionName: "settleDividend",
        args: [d.id],
        account: config.account,
      });
      const hash = await wallet.writeContract(settle.request);
      await client.waitForTransactionReceipt({ hash });
      log.info("settled", { dividend: d.id, usdg: amount, hash });
    } catch (err) {
      log.error("settlement failed", {
        dividend: d.id,
        usdg: amount,
        reason: (err as Error).message.split("\n")[0],
      });
    }
  }
}
