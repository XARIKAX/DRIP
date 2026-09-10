import { type Address, type PublicClient, type WalletClient } from "viem";
import { splitVaultAbi, yieldTokenAbi } from "@drip-markets/sdk";
import type { KeeperConfig } from "./config.js";
import { log } from "./log.js";

/**
 * Stop the yield clock on every series that has matured.
 *
 * A matured series that nobody has frozen keeps accruing to its Yield Tokens off a
 * multiplier that is still rising, and every share of that comes out of the Principal
 * Tokens' backing. The vault freezes on any path that pays somebody out, so a holder
 * who turns up cannot be short-changed — but nobody has to turn up. Between maturity
 * and the first visitor a real dividend can land, and that window is the only way this
 * design can pay the wrong person.
 *
 * So the keeper closes it. Permissionless, needs no role, costs one transaction per
 * series once in the series' life, and only ever when the chain's own clock says the
 * series has expired.
 */
export async function freezeMaturedSeries(
  config: KeeperConfig,
  client: PublicClient,
  wallet: WalletClient,
  now: bigint
): Promise<void> {
  const vault = config.deployment.splitVault;
  if (!vault) {
    log.info("no split vault on this deployment; skipping series freeze");
    return;
  }

  const count = (await client.readContract({
    address: vault,
    abi: splitVaultAbi,
    functionName: "seriesCount",
  })) as bigint;

  if (count === 0n) return;

  for (let id = 1n; id <= count; ++id) {
    const s = (await client.readContract({
      address: vault,
      abi: splitVaultAbi,
      functionName: "series",
      args: [id],
    })) as readonly [Address, bigint, Address, Address, boolean];

    const [, maturity, , yieldToken, exists] = s;
    if (!exists || now < maturity) continue;

    // Already frozen is the common case for an expired series, and reading is far
    // cheaper than a reverting simulate on every cycle for the rest of time.
    const frozen = (await client.readContract({
      address: yieldToken,
      abi: yieldTokenAbi,
      functionName: "frozenIndex",
    })) as bigint;
    if (frozen !== 0n) continue;

    log.info("freezing a matured series", { seriesId: id, maturity });
    if (config.dryRun) {
      log.warn("DRY_RUN; not broadcasting the freeze", { seriesId: id });
      continue;
    }

    try {
      const sim = await client.simulateContract({
        address: vault,
        abi: splitVaultAbi,
        functionName: "freezeSeries",
        args: [id],
        account: config.account,
      });
      const hash = await wallet.writeContract(sim.request);
      await client.waitForTransactionReceipt({ hash });
      log.info("series frozen", { seriesId: id, hash });
    } catch (err) {
      // One series failing must not stop the rest: they expire together, and a stuck
      // one would otherwise keep every later series accruing past its own maturity.
      log.error("freeze failed", {
        seriesId: id,
        reason: (err as Error).message.split("\n")[0],
      });
    }
  }
}
