import { erc20Abi, type Address, type PublicClient } from "viem";
import {
  advanceVaultAbi,
  deployments,
  dividendRegistryAbi,
  dripCoreAbi,
  lendingPoolAbi,
  listings,
  principalTokenAbi,
  reinvestorAbi,
  rewardVaultAbi,
  splitVaultAbi,
  yieldTokenAbi,
  streamEngineAbi,
} from "./generated";
import {
  DividendStatus,
  Mode,
  type CreditParameters,
  type CreditPosition,
  type Deployment,
  type DividendView,
  type PositionView,
  type StockToken,
  type SplitDividendView,
  type SplitPositionView,
  type SplitSeriesView,
  type StreamView,
  type VaultPosition,
  type VaultStats,
  type RewardStats,
  type RewardPosition,
  type ProtocolTotals,
} from "./types";

/** Address book for a chain. Throws loudly rather than returning a half configured object. */
export function getDeployment(chainId: number): Deployment {
  const d = deployments[chainId];
  if (!d) {
    const known = Object.keys(deployments).join(", ") || "none";
    throw new Error(
      `No Osinko deployment for chain ${chainId}. Known chains: ${known}. ` +
        `Run scripts/deploy-local.sh, or point NEXT_PUBLIC_CHAIN_ID at a deployed chain.`
    );
  }
  return d;
}

/**
 * The one function every swap adapter answers for a price.
 *
 * Read through the interface rather than either implementation: this call used to go
 * through mockSwapAdapterAbi, which exposed priceUsdg only because the mock happened
 * to declare it as a public mapping. ISwapAdapter declares it now, so both adapters
 * answer it and neither implementation's ABI is the right thing to depend on.
 */
const swapAdapterPriceAbi = [
  {
    type: "function",
    name: "priceUsdg",
    stateMutability: "view",
    inputs: [{ name: "stockToken", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Every chain the repo has an address book for. */
export function knownChainIds(): number[] {
  return Object.keys(deployments).map(Number);
}

/**
 * True when this deployment runs the testnet stand ins, and so has faucets.
 *
 * Books written before the `mocks` field existed were all testnet deploys, so a
 * missing field means mocks. Production books set it to false explicitly. Read this
 * rather than the field, so an old book never turns a faucet button into a revert.
 */
export function usesMocks(d: Deployment): boolean {
  return d.mocks !== false;
}

/**
 * Read side of the protocol.
 *
 * Everything here comes from view calls and events. There is no backend, no indexer
 * and no cached server state. If the chain says it, the app shows it; if it does not,
 * the app shows nothing rather than something stale.
 */
export class DripReader {
  constructor(
    readonly client: PublicClient,
    readonly deployment: Deployment
  ) {}

  static forChain(client: PublicClient, chainId: number): DripReader {
    return new DripReader(client, getDeployment(chainId));
  }

  // -------------------------------------------------------------------
  // Tokens and calendar
  // -------------------------------------------------------------------

  /**
   * A token's price, or null if the oracle refuses to answer.
   *
   * Reads that only feed a display must not take the whole page down because one
   * feed went quiet. Everything that moves money keeps calling the oracle directly
   * and keeps failing closed.
   */
  /** Cached, because it is fixed at deploy and this sits on a rate limited public RPC. */
  private shareDecimalsCache?: number;

  /**
   * How many decimals the vault's SHARES carry, which is not USDG's six.
   *
   * AdvanceVault overrides _decimalsOffset() to 3 on top of the asset's decimals, so
   * a share is 1e9, not 1e18. Reading it rather than hardcoding 9 keeps this correct
   * if the offset changes or a chain lists an asset with different decimals.
   */
  private async shareDecimals(): Promise<number> {
    if (this.shareDecimalsCache === undefined) {
      this.shareDecimalsCache = await this.client.readContract({
        address: this.deployment.advanceVault,
        abi: advanceVaultAbi,
        functionName: "decimals",
      });
    }
    return this.shareDecimalsCache;
  }

  private async priceOrNull(stockToken: Address): Promise<bigint | null> {
    try {
      return (await this.client.readContract({
        address: this.deployment.swapAdapter,
        abi: swapAdapterPriceAbi,
        functionName: "priceUsdg",
        args: [stockToken],
      })) as bigint;
    } catch {
      return null;
    }
  }

  /** Every stock token the registry knows about, with metadata and price. */
  async getStockTokens(): Promise<StockToken[]> {
    const d = this.deployment;
    const addresses = (await this.client.readContract({
      address: d.dividendRegistry,
      abi: dividendRegistryAbi,
      functionName: "supportedTokens",
    })) as readonly Address[];

    if (addresses.length === 0) return [];

    // Plain parallel reads rather than multicall: works against any RPC with zero
    // chain configuration, and testnet sized batches never justify the aggregator.
    return Promise.all(
      addresses.map(async (address) => {
        const [symbol, name, decimals, priceUsdg] = await Promise.all([
          this.client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
          this.client.readContract({ address, abi: erc20Abi, functionName: "name" }),
          this.client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
          this.priceOrNull(address),
        ]);
        return { address, symbol, name, decimals: Number(decimals), priceUsdg };
      })
    );
  }

  /** The ex date calendar, newest id last, enriched with symbols. */
  async getCalendar(): Promise<DividendView[]> {
    const d = this.deployment;
    const count = (await this.client.readContract({
      address: d.dividendRegistry,
      abi: dividendRegistryAbi,
      functionName: "dividendCount",
    })) as bigint;

    if (count === 0n) return [];

    const raw = (await this.client.readContract({
      address: d.dividendRegistry,
      abi: dividendRegistryAbi,
      functionName: "getDividends",
      args: [0n, count],
    })) as readonly {
      stockToken: Address;
      amountPerToken: bigint;
      exDate: bigint;
      payDate: bigint;
      declaredAt: bigint;
      status: number;
    }[];

    const symbols = await this.symbolMap(raw.map((r) => r.stockToken));

    return raw.map((r, i) => ({
      id: BigInt(i + 1),
      stockToken: r.stockToken,
      symbol: symbols.get(r.stockToken.toLowerCase()) ?? "",
      amountPerToken: r.amountPerToken,
      exDate: Number(r.exDate),
      payDate: Number(r.payDate),
      declaredAt: Number(r.declaredAt),
      status: r.status as DividendStatus,
      daysEarly: Math.round((Number(r.payDate) - Number(r.exDate)) / 86_400),
    }));
  }

  // -------------------------------------------------------------------
  // Holder state
  // -------------------------------------------------------------------

  /** Deposited positions, with mode and USDG value. */
  async getPositions(user: Address): Promise<PositionView[]> {
    const d = this.deployment;
    const tokens = (await this.client.readContract({
      address: d.dripCore,
      abi: dripCoreAbi,
      functionName: "tokensOf",
      args: [user],
    })) as readonly Address[];

    if (tokens.length === 0) return [];

    return Promise.all(
      tokens.map(async (stockToken) => {
        const [position, symbol, price] = await Promise.all([
          this.client.readContract({
            address: d.dripCore,
            abi: dripCoreAbi,
            functionName: "positionOf",
            args: [user, stockToken],
          }),
          this.client.readContract({ address: stockToken, abi: erc20Abi, functionName: "symbol" }),
          this.priceOrNull(stockToken),
        ]);
        return {
          stockToken,
          symbol,
          amount: position.amount,
          mode: position.mode as Mode,
          valueUsdg: price === null ? null : (position.amount * price) / 10n ** 18n,
        };
      })
    );
  }

  /** Streams for a holder, with live claimable and the per second rate. */
  async getStreams(user: Address): Promise<StreamView[]> {
    const d = this.deployment;
    const ids = (await this.client.readContract({
      address: d.streamEngine,
      abi: streamEngineAbi,
      functionName: "streamsOf",
      args: [user],
    })) as readonly bigint[];

    if (ids.length === 0) return [];

    const streams = await Promise.all(
      ids.map(async (id) => {
        const [s, claimable, ratePerSecondScaled] = await Promise.all([
          this.client.readContract({
            address: d.streamEngine,
            abi: streamEngineAbi,
            functionName: "getStream",
            args: [id],
          }),
          this.client.readContract({
            address: d.streamEngine,
            abi: streamEngineAbi,
            functionName: "claimable",
            args: [id],
          }),
          this.client.readContract({
            address: d.streamEngine,
            abi: streamEngineAbi,
            functionName: "ratePerSecondScaled",
            args: [id],
          }),
        ]);
        return {
          id,
          user: s.user,
          dividendId: s.dividendId,
          stockToken: s.stockToken,
          symbol: "",
          total: s.total,
          claimed: s.claimed,
          claimable,
          start: Number(s.start),
          end: Number(s.end),
          mode: s.mode as Mode,
          closed: s.closed,
          ratePerSecondScaled,
        } satisfies StreamView;
      })
    );

    const symbols = await this.symbolMap(streams.map((s) => s.stockToken));
    for (const s of streams) s.symbol = symbols.get(s.stockToken.toLowerCase()) ?? "";
    return streams;
  }

  /**
   * Dividends this holder could start right now.
   * A dividend qualifies when it is declared, inside its ex to pay window, and the
   * holder had a balance on deposit at the ex date.
   */
  async getActivatable(user: Address): Promise<{ dividend: DividendView; gross: bigint }[]> {
    const calendar = await this.getCalendar();
    const now = Math.floor(Date.now() / 1000);
    const candidates = calendar.filter(
      (dv) => dv.status === DividendStatus.DECLARED && now >= dv.exDate && now < dv.payDate
    );
    if (candidates.length === 0) return [];

    const pending = await Promise.all(
      candidates.map((dv) =>
        this.client.readContract({
          address: this.deployment.dripCore,
          abi: dripCoreAbi,
          functionName: "pendingEntitlement",
          args: [dv.id, user],
        })
      )
    );

    return candidates
      .map((dividend, i) => ({ dividend, gross: pending[i]! }))
      .filter((row) => row.gross > 0n);
  }

  /** Settled dividends the holder never activated and can still take at face value. */
  async getClaimableSettled(user: Address): Promise<{ dividend: DividendView; gross: bigint }[]> {
    const calendar = await this.getCalendar();
    const candidates = calendar.filter((dv) => dv.status === DividendStatus.SETTLED);
    if (candidates.length === 0) return [];

    const rows = await Promise.all(
      candidates.map(async (dividend) => {
        const [gross, entitlement] = await Promise.all([
          this.client.readContract({
            address: this.deployment.dripCore,
            abi: dripCoreAbi,
            functionName: "pendingEntitlement",
            args: [dividend.id, user],
          }),
          this.client.readContract({
            address: this.deployment.dripCore,
            abi: dripCoreAbi,
            functionName: "entitlementOf",
            args: [dividend.id, user],
          }),
        ]);
        return { dividend, gross, entitlement };
      })
    );

    return rows
      .filter((row) => row.gross > 0n && !row.entitlement.activated && !row.entitlement.claimed)
      .map(({ dividend, gross }) => ({ dividend, gross }));
  }

  /** A holder's reinvestment slippage tolerance in basis points. */
  async getSlippageBps(user: Address): Promise<bigint> {
    return (await this.client.readContract({
      address: this.deployment.reinvestor,
      abi: reinvestorAbi,
      functionName: "maxSlippageBps",
      args: [user],
    })) as bigint;
  }

  // -------------------------------------------------------------------
  // Vault
  // -------------------------------------------------------------------

  /** Everything the vault page renders, in one multicall. */
  async getVaultStats(): Promise<VaultStats> {
    const address = this.deployment.advanceVault;
    const abi = advanceVaultAbi;
    const shareDecimals = await this.shareDecimals();

    const [
      totalAssets,
      cash,
      freeCash,
      receivables,
      obligations,
      totalFeesAccrued,
      totalLosses,
      utilizationBps,
      maxUtilizationBps,
      advanceFeeBps,
      totalSupply,
      sharePrice,
    ] = await Promise.all([
      this.client.readContract({ address, abi, functionName: "totalAssets" }),
      this.client.readContract({ address, abi, functionName: "cash" }),
      this.client.readContract({ address, abi, functionName: "freeCash" }),
      this.client.readContract({ address, abi, functionName: "receivables" }),
      this.client.readContract({ address, abi, functionName: "obligations" }),
      this.client.readContract({ address, abi, functionName: "totalFeesAccrued" }),
      this.client.readContract({ address, abi, functionName: "totalLosses" }),
      this.client.readContract({ address, abi, functionName: "utilizationBps" }),
      this.client.readContract({ address, abi, functionName: "maxUtilizationBps" }),
      this.client.readContract({ address, abi, functionName: "advanceFeeBps" }),
      this.client.readContract({ address, abi, functionName: "totalSupply" }),
      this.client
        .readContract({ address, abi, functionName: "convertToAssets", args: [10n ** BigInt(shareDecimals)] }),
    ]);

    return {
      shareDecimals,
      totalAssets,
      cash,
      freeCash,
      receivables,
      obligations,
      totalFeesAccrued,
      totalLosses,
      utilizationBps,
      maxUtilizationBps,
      advanceFeeBps,
      totalSupply,
      sharePrice,
    };
  }

  // -------------------------------------------------------------------
  // Rewards
  // -------------------------------------------------------------------

  /**
   * The reward vault's state, or null on a deployment that predates it.
   *
   * Null rather than a throw: the protocol shipped before this contract existed and a
   * book without one is a valid book, so the app renders the rest of itself either way.
   */
  async getRewardStats(): Promise<RewardStats | null> {
    const address = this.deployment.rewardVault;
    if (!address) return null;
    const abi = rewardVaultAbi;

    const [totalSupply, totalFunded, totalRedeemed, unallocated] = await Promise.all([
      this.client.readContract({ address, abi, functionName: "totalSupply" }),
      this.client.readContract({ address, abi, functionName: "totalFunded" }),
      this.client.readContract({ address, abi, functionName: "totalRedeemed" }),
      this.client.readContract({ address, abi, functionName: "unallocated" }),
    ]);

    return { totalSupply, totalFunded, totalRedeemed, unallocated };
  }

  /**
   * One holder's reward position: what they hold now, and what they have ever been
   * handed or taken.
   *
   * The balance is a read; the two lifetime figures are a log scan, because the vault
   * keeps only protocol wide counters. Reading `totalRedeemed` where a personal number
   * belonged is exactly how "earned so far" came to show one wallet the sum of
   * everybody's, so the personal figures are derived from `Distributed` and `Redeemed`
   * filtered to this address and nothing else.
   *
   * A failed scan reports `historyRead: false` rather than zeros. "We could not read
   * your history" and "you have earned nothing" are different sentences.
   */
  async getRewardPosition(user: Address): Promise<RewardPosition | null> {
    const address = this.deployment.rewardVault;
    if (!address) return null;

    const balance = (await this.client.readContract({
      address,
      abi: rewardVaultAbi,
      functionName: "balanceOf",
      args: [user],
    })) as bigint;

    const from = this.deployment.rewardVaultBlock;
    if (from === undefined) {
      // No floor to scan from, and starting at block zero would walk the whole chain.
      return { balance, lifetimeEarned: 0n, lifetimeRedeemed: 0n, historyRead: false };
    }

    try {
      // The event has to be cast to satisfy getLogs' overload, which then types `args`
      // as undefined. Casting the whole parameter object keeps the indexed filter,
      // which is the point: the RPC does the filtering, not this process.
      const scan = (eventName: string, filter: Record<string, Address>) =>
        this.client.getLogs({
          address,
          event: rewardVaultAbi.find((e) => e.type === "event" && e.name === eventName),
          args: filter,
          fromBlock: BigInt(from),
          toBlock: "latest",
        } as never);

      const [distributed, redeemed] = await Promise.all([
        scan("Distributed", { to: user }),
        scan("Redeemed", { holder: user }),
      ]);

      const sum = (logs: unknown[]) =>
        logs.reduce<bigint>((a, l) => a + ((l as { args?: { amount?: bigint } }).args?.amount ?? 0n), 0n);

      return {
        balance,
        lifetimeEarned: sum(distributed),
        lifetimeRedeemed: sum(redeemed),
        historyRead: true,
      };
    } catch {
      // A public RPC refusing the range is the common case, and it must not take the
      // whole panel down: the balance is still true and still worth showing.
      return { balance, lifetimeEarned: 0n, lifetimeRedeemed: 0n, historyRead: false };
    }
  }

  /**
   * Protocol wide totals for the tracker: what is on deposit and what has been paid.
   *
   * Two figures, both read straight off the chain, both deliberately narrow.
   *
   * `stockUsdg` prices every token's DripCore balance with the same oracle the rest of
   * the app uses, and reports the tokens it could not price separately rather than
   * quietly dropping them. A token with a quiet feed still has real stock behind it;
   * calling that zero would understate the platform, so it is counted in `unpriced`
   * and named, not folded into the total.
   *
   * `paidOutUsdg` is USDG holders have actually taken out of the reward vault. It does
   * NOT include dividend advances or stream claims: those leave no cumulative counter
   * onchain, so totalling them means indexing events, and no dividend has been declared
   * on this deployment yet. When one is, this needs an indexer, not an estimate.
   */
  async getProtocolTotals(): Promise<ProtocolTotals> {
    const d = this.deployment;
    const tokens = await this.getStockTokens();

    const rows = await Promise.all(
      tokens.map(async (t) => {
        const amount = (await this.client.readContract({
          address: d.dripCore,
          abi: dripCoreAbi,
          functionName: "totalDeposited",
          args: [t.address],
        })) as bigint;
        // Stock tokens carry their own decimals, prices six. amount * price / 1eN lands on six.
        const valueUsdg = t.priceUsdg === null ? null : (amount * t.priceUsdg) / 10n ** BigInt(t.decimals);
        return { address: t.address, symbol: t.symbol, amount, valueUsdg, rate: this.rewardRate(t.symbol) };
      })
    );

    let stockUsdg = 0n;
    const unpriced: string[] = [];
    for (const row of rows) {
      if (row.valueUsdg === null) {
        if (row.amount > 0n) unpriced.push(row.symbol);
      } else {
        stockUsdg += row.valueUsdg;
      }
    }

    const reward = await this.getRewardStats();
    const rewardedUsdg = reward ? reward.totalSupply + reward.totalRedeemed : 0n;

    const byToken = rows
      .map(({ rate, ...row }) => ({ ...row, realisedPct: this.realisedPct(row, rate, rows, rewardedUsdg) }))
      .sort((a, b) => Number((b.valueUsdg ?? 0n) - (a.valueUsdg ?? 0n)));

    return {
      stockUsdg,
      unpriced,
      byToken,
      paidOutUsdg: reward?.totalRedeemed ?? 0n,
      owedUsdg: reward?.totalSupply ?? 0n,
      fundedUsdg: reward?.totalFunded ?? 0n,
      rewardedUsdg,
    };
  }

  /** The listing's posted rate for a symbol, or zero. */
  private rewardRate(symbol: string): number {
    return listings[this.deployment.chainId]?.tokens.find((t) => t.symbol === symbol)?.rewardRatePct ?? 0;
  }

  /**
   * What a dollar deposited in this stock has actually been paid, as a percentage of
   * the deposit. Realised, cumulative, and deliberately NOT annualised.
   *
   * The keeper splits each pot across holders weighted by `deposit value x posted
   * rate`, so a stock's share of everything ever handed out is its share of that
   * weighted total. Dividing that back by the stock's own deposit value gives the
   * return a dollar in it has earned — which is why the posted rates have to drive the
   * split for these numbers to differ at all. Under a split weighted by value alone
   * every stock would return the identical figure, and eleven different percentages on
   * the screen would be decoration.
   *
   * Not annualised because the rewards are discretionary lump sums, not a stream. One
   * 50 USDG drop onto 60 USDG of deposits two days after launch annualises to five
   * figures of APY, which is arithmetic rather than information, and it is the number
   * someone would deposit against. Cumulative-paid-so-far is a fact; the extrapolation
   * from it is not.
   */
  private realisedPct(
    row: { valueUsdg: bigint | null },
    rate: number,
    all: { valueUsdg: bigint | null; rate: number }[],
    rewardedUsdg: bigint
  ): number | null {
    if (rewardedUsdg === 0n || row.valueUsdg === null || row.valueUsdg === 0n) return null;

    // Weights in floating point: this is a display figure, and the bigint precision
    // that matters is on the chain, in the amounts the keeper actually distributed.
    const weightOf = (v: bigint | null, r: number) => (v === null ? 0 : Number(v) * r);
    const totalWeight = all.reduce((a, t) => a + weightOf(t.valueUsdg, t.rate), 0);
    if (totalWeight === 0) return null;

    const share = (Number(rewardedUsdg) * weightOf(row.valueUsdg, rate)) / totalWeight;
    return (share / Number(row.valueUsdg)) * 100;
  }

  /** An LP's stake. */
  async getVaultPosition(user: Address): Promise<VaultPosition> {
    const address = this.deployment.advanceVault;
    const abi = advanceVaultAbi;

    const [shares, maxWithdraw] = await Promise.all([
      this.client.readContract({ address, abi, functionName: "balanceOf", args: [user] }),
      this.client.readContract({ address, abi, functionName: "maxWithdraw", args: [user] }),
    ]);

    const assets =
      shares === 0n
        ? 0n
        : await this.client.readContract({ address, abi, functionName: "convertToAssets", args: [shares] });

    return { shares, assets, maxWithdraw };
  }

  // -------------------------------------------------------------------
  // Wallet balances
  // -------------------------------------------------------------------

  /** Wallet balances for USDG and every supported stock token. */
  async getWalletBalances(user: Address): Promise<{ usdg: bigint; stocks: Record<Address, bigint> }> {
    const tokens = await this.getStockTokens();
    const [usdg, ...stockBalances] = await Promise.all([
      this.client.readContract({
        address: this.deployment.usdg,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user],
      }),
      ...tokens.map((t) =>
        this.client.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [user] })
      ),
    ]);

    const stocks: Record<Address, bigint> = {};
    tokens.forEach((t, i) => {
      stocks[t.address] = stockBalances[i]!;
    });
    return { usdg, stocks };
  }

  // -------------------------------------------------------------------
  // Credit
  // -------------------------------------------------------------------

  /** True when this chain's deployment has a credit market. */
  hasCredit(): boolean {
    return Boolean(this.deployment.lendingPool);
  }

  /**
   * A borrower's whole position, in one call.
   *
   * Returns null when no lending pool is deployed on this chain, which is what an
   * address book written before the credit market existed looks like. Callers render
   * the Borrow page empty rather than failing.
   */
  async getCreditPosition(user: Address): Promise<CreditPosition | null> {
    const pool = this.deployment.lendingPool;
    if (!pool) return null;

    const snapshot = (await this.client.readContract({
      address: pool,
      abi: lendingPoolAbi,
      functionName: "accountSnapshot",
      args: [user],
    })) as readonly bigint[];

    const [collateralUsdg, borrowingPower, debt, available, accruedInterest, servicedFromDividends, healthFactorBps, borrowRateBps] =
      snapshot;

    return {
      collateralUsdg: collateralUsdg!,
      borrowingPower: borrowingPower!,
      debt: debt!,
      available: available!,
      accruedInterest: accruedInterest!,
      servicedFromDividends: servicedFromDividends!,
      healthFactorBps: healthFactorBps!,
      borrowRateBps: borrowRateBps!,
    };
  }

  /** The market's risk parameters as deployed. Constant between admin changes. */
  async getCreditParameters(): Promise<CreditParameters | null> {
    const pool = this.deployment.lendingPool;
    if (!pool) return null;

    const [maxLtvBps, liquidationThresholdBps, liquidationBonusBps, closeFactorBps] = (await Promise.all([
      this.client.readContract({ address: pool, abi: lendingPoolAbi, functionName: "maxLtvBps" }),
      this.client.readContract({ address: pool, abi: lendingPoolAbi, functionName: "liquidationThresholdBps" }),
      this.client.readContract({ address: pool, abi: lendingPoolAbi, functionName: "liquidationBonusBps" }),
      this.client.readContract({ address: pool, abi: lendingPoolAbi, functionName: "closeFactorBps" }),
    ])) as [bigint, bigint, bigint, bigint];

    return { maxLtvBps, liquidationThresholdBps, liquidationBonusBps, closeFactorBps };
  }

  /** Whether this holder has opted into dividends paying down principal too. */
  async getAutoRepayPrincipal(user: Address): Promise<boolean> {
    const pool = this.deployment.lendingPool;
    if (!pool) return false;
    return (await this.client.readContract({
      address: pool,
      abi: lendingPoolAbi,
      functionName: "autoRepayPrincipal",
      args: [user],
    })) as boolean;
  }

  // -------------------------------------------------------------------
  // Split
  // -------------------------------------------------------------------

  /** True when this chain's deployment has a SplitVault. */
  hasSplit(): boolean {
    return Boolean(this.deployment.splitVault);
  }

  /**
   * Every series the vault has opened, newest last.
   *
   * Series ids start at 1 and are never reused, so walking the counter is exact.
   * A deployment with no series returns an empty list rather than throwing.
   */
  async getSplitSeries(): Promise<SplitSeriesView[]> {
    const vault = this.deployment.splitVault;
    if (!vault) return [];

    const [count, splitFeeBps] = (await Promise.all([
      this.client.readContract({ address: vault, abi: splitVaultAbi, functionName: "seriesCount" }),
      this.client.readContract({ address: vault, abi: splitVaultAbi, functionName: "splitFeeBps" }),
    ])) as [bigint, bigint];

    if (count === 0n) return [];

    const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
    const rows = await Promise.all(
      ids.map(async (seriesId) => {
        const s = (await this.client.readContract({
          address: vault,
          abi: splitVaultAbi,
          functionName: "series",
          args: [seriesId],
        })) as readonly [Address, bigint, Address, Address, boolean];

        const [stockToken, maturity, principalToken, yieldToken, exists] = s;
        if (!exists) return null;

        const [symbol, name, ptSupply, ytSupply, priceUsdg] = await Promise.all([
          this.client.readContract({ address: stockToken, abi: erc20Abi, functionName: "symbol" }),
          this.client.readContract({ address: stockToken, abi: erc20Abi, functionName: "name" }),
          this.client.readContract({ address: principalToken, abi: principalTokenAbi, functionName: "totalSupply" }),
          this.client.readContract({ address: yieldToken, abi: yieldTokenAbi, functionName: "totalSupply" }),
          // Through priceOrNull, never raw. A raw read here threw on one stale feed and
          // rejected the whole Promise.all, so a quiet AAPL emptied the Split page of
          // all eleven series rather than one. Same failure the token list had; this
          // call site was missed.
          this.priceOrNull(stockToken),
        ]);

        return {
          seriesId,
          stockToken,
          symbol,
          name,
          maturity: Number(maturity),
          principalToken,
          yieldToken,
          ptSupply: ptSupply as bigint,
          ytSupply: ytSupply as bigint,
          priceUsdg: priceUsdg as bigint | null,
          splitFeeBps: Number(splitFeeBps),
        } satisfies SplitSeriesView;
      })
    );

    return rows.filter((r): r is SplitSeriesView => r !== null);
  }

  /** A holder's share token and dividend token balances in one series. */
  async getSplitPosition(seriesId: bigint, user: Address): Promise<SplitPositionView | null> {
    const vault = this.deployment.splitVault;
    if (!vault) return null;

    const s = (await this.client.readContract({
      address: vault,
      abi: splitVaultAbi,
      functionName: "series",
      args: [seriesId],
    })) as readonly [Address, bigint, Address, Address, boolean];
    if (!s[4]) return null;

    const [ptBalance, ytBalance] = await Promise.all([
      this.client.readContract({ address: s[2], abi: principalTokenAbi, functionName: "balanceOf", args: [user] }),
      this.client.readContract({ address: s[3], abi: yieldTokenAbi, functionName: "balanceOf", args: [user] }),
    ]);

    return { seriesId, ptBalance: ptBalance as bigint, ytBalance: ytBalance as bigint };
  }

  /**
   * The dividends a series has seen, with this holder's claim on each.
   *
   * Every dividend on the series' own stock, whatever its ex date. It is tempting to
   * filter to the ones already ex, but the only clock available here is the caller's
   * wall clock and the ex date is a chain timestamp — on any chain whose time has
   * drifted from the browser's, that comparison hides dividends that are genuinely
   * harvestable. The row carries its ex date; the UI gates the button on it.
   */
  async getSplitDividends(seriesId: bigint, user: Address): Promise<SplitDividendView[]> {
    const vault = this.deployment.splitVault;
    if (!vault) return [];

    const s = (await this.client.readContract({
      address: vault,
      abi: splitVaultAbi,
      functionName: "series",
      args: [seriesId],
    })) as readonly [Address, bigint, Address, Address, boolean];
    if (!s[4]) return [];

    const calendar = await this.getCalendar();
    const mine = calendar.filter((d) => d.stockToken.toLowerCase() === s[0].toLowerCase());

    return Promise.all(
      mine.map(async (d) => {
        const [harvested, pool, claimable, claimed, balanceAtEx] = await Promise.all([
          this.client.readContract({ address: vault, abi: splitVaultAbi, functionName: "harvested", args: [seriesId, d.id] }),
          this.client.readContract({ address: vault, abi: splitVaultAbi, functionName: "dividendPool", args: [seriesId, d.id] }),
          this.client.readContract({ address: vault, abi: splitVaultAbi, functionName: "pendingYield", args: [seriesId, d.id, user] }),
          this.client.readContract({ address: vault, abi: splitVaultAbi, functionName: "yieldClaimed", args: [seriesId, d.id, user] }),
          // What the series held when the dividend went ex. Zero means this dividend
          // predates the series having a balance, and there is nothing to harvest.
          this.client.readContract({
            address: this.deployment.dripCore,
            abi: dripCoreAbi,
            functionName: "balanceOfAt",
            args: [vault, s[0], BigInt(d.exDate)],
          }),
        ]);

        return {
          seriesId,
          dividendId: d.id,
          symbol: d.symbol,
          amountPerToken: d.amountPerToken,
          exDate: d.exDate,
          eligible: (balanceAtEx as bigint) > 0n,
          harvested: harvested as boolean,
          pool: pool as bigint,
          claimable: claimable as bigint,
          claimed: claimed as boolean,
        } satisfies SplitDividendView;
      })
    );
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  /** Lowercased address to ticker, deduplicated. */
  private async symbolMap(addresses: readonly Address[]): Promise<Map<string, string>> {
    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))] as Address[];
    if (unique.length === 0) return new Map();
    const symbols = await Promise.all(
      unique.map((address) => this.client.readContract({ address, abi: erc20Abi, functionName: "symbol" }))
    );
    return new Map(unique.map((a, i) => [a, symbols[i]!]));
  }
}
