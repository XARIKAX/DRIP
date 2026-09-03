#!/usr/bin/env node
/**
 * The Osinko MCP server.
 *
 * Exposes the protocol to agents over the Model Context Protocol, stdio transport.
 * The tool surface is the same set of intents the web app's agent console builds,
 * which is the architectural point: one protocol, many clients, identical semantics.
 *
 * Security model, stated where it cannot be missed:
 *
 *   READ tools call view functions and answer directly. No key involved.
 *   WRITE tools NEVER execute. They return an unsigned transaction payload
 *   ({ to, data, value, description }) for the user's own wallet to review and sign.
 *   This server holds no private key, takes no key configuration, and has no code
 *   path that could broadcast a transaction.
 *
 * Configuration, all optional:
 *   DRIP_RPC_URL    RPC endpoint (default http://127.0.0.1:8545)
 *   DRIP_CHAIN_ID   Chain id whose address book to load (default 31337)
 *
 * Run:
 *   pnpm --filter @drip-markets/mcp start
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, http, isAddress, type Address } from "viem";
import {
  DripReader,
  Mode,
  MODE_LABELS,
  STATUS_LABELS,
  buildApprove,
  buildClaimStream,
  buildDeposit,
  buildSetMode,
  formatBps,
  formatStock,
  formatUsdg,
  getDeployment,
  parseStock,
  type UnsignedTx,
} from "@drip-markets/sdk";

const RPC_URL = process.env.DRIP_RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.DRIP_CHAIN_ID ?? 31337);

const deployment = getDeployment(CHAIN_ID);
const client = createPublicClient({ transport: http(RPC_URL) });
const reader = new DripReader(client, deployment);

const server = new McpServer({
  name: "osinko",
  version: "0.1.0",
});

/** Every tool answers in JSON. Agents parse; humans can still read it. */
function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

/** Writes come back in one fixed shape so clients can route them to a wallet blindly. */
function unsigned(txs: UnsignedTx[], summary: string) {
  return ok({
    action: "sign_and_send",
    summary,
    note: "These transactions are unsigned. Present them to the user's wallet for review. This server cannot execute them.",
    transactions: txs,
  });
}

const addressSchema = z
  .string()
  .refine((value): value is Address => isAddress(value), "Must be a 0x address");

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

server.tool(
  "get_positions",
  "Stock token positions a holder has deposited in Osinko: amount, USDG value, and the dividend mode each position is set to.",
  { user: addressSchema.describe("Holder address") },
  async ({ user }) => {
    const positions = await reader.getPositions(user as Address);
    return ok(
      positions.map((p) => ({
        symbol: p.symbol,
        stockToken: p.stockToken,
        amount: formatStock(p.amount),
        valueUsdg: formatUsdg(p.valueUsdg),
        mode: MODE_LABELS[p.mode],
      }))
    );
  }
);

server.tool(
  "get_streams",
  "Dividend streams for a holder: claimable now, total, claimed, window, mode, and whether each stream is still open.",
  { user: addressSchema.describe("Holder address") },
  async ({ user }) => {
    const streams = await reader.getStreams(user as Address);
    return ok(
      streams.map((s) => ({
        streamId: s.id.toString(),
        dividendId: s.dividendId.toString(),
        symbol: s.symbol,
        claimableUsdg: formatUsdg(s.claimable),
        totalUsdg: formatUsdg(s.total),
        claimedUsdg: formatUsdg(s.claimed),
        startsAt: new Date(s.start * 1000).toISOString(),
        endsAt: new Date(s.end * 1000).toISOString(),
        mode: MODE_LABELS[s.mode],
        closed: s.closed,
      }))
    );
  }
);

server.tool(
  "get_calendar",
  "The dividend calendar: every declared dividend with amount per share, ex date, pay date, status, and how many days early Osinko pays.",
  {},
  async () => {
    const calendar = await reader.getCalendar();
    return ok(
      calendar.map((d) => ({
        dividendId: d.id.toString(),
        symbol: d.symbol,
        amountPerShareUsdg: formatUsdg(d.amountPerToken),
        exDate: new Date(d.exDate * 1000).toISOString(),
        payDate: new Date(d.payDate * 1000).toISOString(),
        status: STATUS_LABELS[d.status],
        daysEarly: d.daysEarly,
      }))
    );
  }
);

server.tool(
  "get_vault",
  "Advance vault stats: total assets, utilisation against the cap, advances outstanding, lifetime fees, share price.",
  {},
  async () => {
    const v = await reader.getVaultStats();
    return ok({
      totalAssetsUsdg: formatUsdg(v.totalAssets),
      utilizationPercent: formatBps(v.utilizationBps),
      utilizationCapPercent: formatBps(v.maxUtilizationBps),
      advancesOutstandingUsdg: formatUsdg(v.receivables),
      owedToHoldersUsdg: formatUsdg(v.obligations),
      lifetimeFeesUsdg: formatUsdg(v.totalFeesAccrued),
      advanceFeePercent: formatBps(v.advanceFeeBps),
      sharePrice: formatUsdg(v.sharePrice, 6),
    });
  }
);

// ---------------------------------------------------------------------------
// Write tools. Unsigned payloads only.
// ---------------------------------------------------------------------------

const modeSchema = z
  .enum(["CASH_EARLY", "STREAM", "REINVEST"])
  .describe("CASH_EARLY pays the whole dividend at the ex date. STREAM drips it per second. REINVEST streams and buys the same stock back on every claim.");

server.tool(
  "set_mode",
  "Build the unsigned transaction that changes what happens to a holder's dividends on one stock token. Returns calldata for the user's wallet; nothing is executed.",
  {
    symbol: z.string().describe("Ticker, e.g. AAPL"),
    mode: modeSchema,
  },
  async ({ symbol, mode }) => {
    const tokens = await reader.getStockTokens();
    const token = tokens.find((t) => t.symbol === symbol.toUpperCase());
    if (!token) return fail(`Unknown token ${symbol}. Known: ${tokens.map((t) => t.symbol).join(", ")}`);
    const tx = buildSetMode(deployment, token.address, Mode[mode], token.symbol);
    return unsigned([tx], tx.description);
  }
);

server.tool(
  "claim_stream",
  "Build the unsigned transaction that claims everything a stream has accrued. Only the stream's owner can execute it. Returns calldata; nothing is executed.",
  { streamId: z.string().regex(/^\d+$/).describe("Stream id from get_streams") },
  async ({ streamId }) => {
    const tx = buildClaimStream(deployment, BigInt(streamId));
    return unsigned([tx], tx.description);
  }
);

server.tool(
  "deposit",
  "Build the unsigned approve and deposit transactions that put stock tokens into Osinko. Two transactions, in order. Returns calldata; nothing is executed.",
  {
    symbol: z.string().describe("Ticker, e.g. AAPL"),
    amount: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .describe("Whole token amount, e.g. \"25\" or \"2.5\""),
  },
  async ({ symbol, amount }) => {
    const tokens = await reader.getStockTokens();
    const token = tokens.find((t) => t.symbol === symbol.toUpperCase());
    if (!token) return fail(`Unknown token ${symbol}. Known: ${tokens.map((t) => t.symbol).join(", ")}`);
    const parsed = parseStock(amount);
    if (parsed === 0n) return fail("Amount parses to zero");
    return unsigned(
      [
        buildApprove(token.address, deployment.dripCore, parsed, token.symbol),
        buildDeposit(deployment, token.address, parsed, token.symbol),
      ],
      `Deposit ${amount} ${token.symbol} into Osinko`
    );
  }
);

// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`osinko mcp: serving chain ${CHAIN_ID} via ${RPC_URL}`);
