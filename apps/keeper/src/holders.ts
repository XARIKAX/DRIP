import type { Address, PublicClient } from "viem";
import { dripCoreAbi } from "@drip-markets/sdk";
import type { KeeperConfig } from "./config.js";
import { log } from "./log.js";

/**
 * Who has ever deposited, rebuilt from Deposited logs.
 *
 * DripCore stores positions in a mapping, so there is no onchain list of holders to
 * read and activateBatch needs an explicit array of addresses. Events are the only
 * enumeration available. The set is kept across cycles and only new blocks are
 * scanned; a restart rescans from START_BLOCK once, which at this volume costs a few
 * seconds and is simpler than persisting a cursor to a disk Railway may recycle.
 *
 * Withdrawals are deliberately NOT removed. Entitlement is decided by balanceOfAt at
 * the ex date, not by the balance now, so someone who deposited before an ex date and
 * withdrew after it is still owed that dividend. Dropping them here would silently
 * skip a payment. pendingEntitlement returns zero for anyone genuinely owed nothing,
 * and activateBatch skips those, so carrying extra addresses is only ever wasted
 * calldata, never a wrong answer.
 */
export class HolderIndex {
  private readonly holders = new Set<Address>();
  private cursor: bigint;

  constructor(
    private readonly client: PublicClient,
    private readonly config: KeeperConfig
  ) {
    this.cursor = config.startBlock;
  }

  get size(): number {
    return this.holders.size;
  }

  list(): Address[] {
    return [...this.holders];
  }

  /** Catch the index up to the head. Safe to call every cycle. */
  async sync(head: bigint): Promise<void> {
    if (head < this.cursor) return;

    const before = this.holders.size;
    let from = this.cursor;

    while (from <= head) {
      const to = from + this.config.logChunk - 1n > head ? head : from + this.config.logChunk - 1n;
      const logs = await this.client.getLogs({
        address: this.config.deployment.dripCore,
        event: dripCoreAbi.find(
          (e) => e.type === "event" && e.name === "Deposited"
        ) as never,
        fromBlock: from,
        toBlock: to,
      });

      for (const entry of logs) {
        const user = (entry as { args?: { user?: Address } }).args?.user;
        if (user) this.holders.add(user);
      }
      from = to + 1n;
    }

    this.cursor = head + 1n;
    if (this.holders.size !== before) {
      log.info("holder index", { known: this.holders.size, added: this.holders.size - before });
    }
  }
}
