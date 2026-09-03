import { erc20Abi, type Address, type PublicClient } from "viem";
import {
  advanceVaultAbi,
  deployments,
  dividendRegistryAbi,
  dripCoreAbi,
  mockSwapAdapterAbi,
  reinvestorAbi,
  streamEngineAbi,
} from "./generated";
import {
  DividendStatus,
  Mode,
  type Deployment,
  type DividendView,
  type PositionView,
  type StockToken,
  type StreamView,
  type VaultPosition,
  type VaultStats,
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

/** Every chain the repo has an address book for. */
export function knownChainIds(): number[] {
  return Object.keys(deployments).map(Number);
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
          this.client.readContract({
            address: d.swapAdapter,
            abi: mockSwapAdapterAbi,
            functionName: "priceUsdg",
            args: [address],
          }),
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
          this.client.readContract({
            address: d.swapAdapter,
            abi: mockSwapAdapterAbi,
            functionName: "priceUsdg",
            args: [stockToken],
          }),
        ]);
        return {
          stockToken,
          symbol,
          amount: position.amount,
          mode: position.mode as Mode,
          valueUsdg: (position.amount * price) / 10n ** 18n,
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
      this.client.readContract({ address, abi, functionName: "convertToAssets", args: [10n ** 18n] }),
    ]);

    return {
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
