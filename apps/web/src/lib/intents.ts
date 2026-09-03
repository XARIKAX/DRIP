import type { ModeName } from "@/lib/data/types";

/**
 * A very small intent parser.
 *
 * Deliberately small. This is not a language model and does not pretend to be one:
 * it recognises a fixed set of phrasings, and anything it does not recognise is
 * reported as not recognised rather than guessed at. Guessing wrong here means
 * building a transaction the user did not ask for.
 *
 * The same intents are exposed as MCP tools in packages/mcp, so an external agent
 * drives exactly the surface this console drives.
 */

export type Intent =
  | { kind: "set_mode"; symbol: string | "ALL"; mode: ModeName }
  | { kind: "claim"; symbol: string | "ALL" }
  | { kind: "activate"; symbol: string | "ALL" }
  | { kind: "deposit"; symbol: string; amount: string }
  | { kind: "withdraw"; symbol: string; amount: string }
  | { kind: "set_slippage"; bps: number }
  | { kind: "borrow"; amount: string }
  | { kind: "repay"; amount: string | "ALL" }
  | { kind: "show"; what: "positions" | "streams" | "calendar" | "vault" | "credit" }
  | { kind: "unsupported"; reason: string; suggestion: string }
  | { kind: "unknown"; input: string };

const MODE_WORDS: { pattern: RegExp; mode: ModeName }[] = [
  { pattern: /\b(reinvest|compound|drip|buy more)\b/i, mode: "REINVEST" },
  { pattern: /\b(stream|drip out|per second|trickle)\b/i, mode: "STREAM" },
  { pattern: /\b(cash|early|lump|pay me now|take it now|upfront)\b/i, mode: "CASH_EARLY" },
];

/** Pull the first known ticker out of a sentence, or ALL when the user said everything. */
function findSymbol(text: string, symbols: string[]): string | "ALL" | null {
  const upper = text.toUpperCase();
  for (const symbol of symbols) {
    if (new RegExp(`\\b${symbol}\\b`).test(upper)) return symbol;
  }
  if (/\b(all|everything|every|each|portfolio)\b/i.test(text)) return "ALL";
  return null;
}

/** First decimal number in the sentence. */
function findAmount(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1]! : null;
}

/**
 * Parse one line into one intent.
 * @param input   Raw user text.
 * @param symbols Tickers the protocol actually knows about.
 */
export function parseIntent(input: string, symbols: string[]): Intent {
  const text = input.trim();
  if (!text) return { kind: "unknown", input };

  // Cross token reinvestment. The protocol buys back the token that paid the
  // dividend, on purpose, so say so rather than silently doing something else.
  const crossToken = text.match(/\b(?:reinvest|compound|drip)\b[^]*?\binto\b\s+([A-Za-z]{1,6})\b/i);
  if (crossToken) {
    const target = crossToken[1]!.toUpperCase();
    const source = findSymbol(text.replace(crossToken[0], ""), symbols);
    if (symbols.includes(target) && source && source !== target) {
      return {
        kind: "unsupported",
        reason: `Reinvesting always buys more of the stock that paid the dividend. ${source} dividends buy ${source}, never ${target}. Nothing happens behind your back.`,
        suggestion: `Set ${source} to Cash early, then buy ${target} yourself. Two steps you can see.`,
      };
    }
  }

  // Splitting one position across two modes. Mode is per token.
  if (/\bhalf\b[^]*\bhalf\b/i.test(text) || /\bsplit\b/i.test(text)) {
    return {
      kind: "unsupported",
      reason: "Each stock has one rule for its dividends. One stock cannot do two things with them at the same time.",
      suggestion: "Set one stock to Stream and another to Reinvest, or hold the stock in two wallets.",
    };
  }

  // "Protect my portfolio" style asks. Streams do not need protecting: they accrue
  // whether or not markets are open, and nothing here is leveraged.
  if (/\b(protect|hedge|safe|de-?risk)\b/i.test(text)) {
    return {
      kind: "unsupported",
      reason: "There is nothing to protect here. Your dividends keep adding up whether markets are open or not, you are not borrowed unless you chose to be, and the pool never touches your stock.",
      suggestion: 'If you want cash instead of stock, try "cash out everything early" or take stock out from the dashboard.',
    };
  }

  if (/\b(borrow|draw|loan)\b/i.test(text) && !/\b(show|what|how)\b/i.test(text)) {
    const amount = findAmount(text);
    if (amount) return { kind: "borrow", amount };
    return {
      kind: "unsupported",
      reason: "Tell me how much to borrow.",
      suggestion: 'Try "borrow 5000 USDG".',
    };
  }

  if (/\brepay\b|\bpay (back|off|down)\b/i.test(text)) {
    const amount = findAmount(text);
    return { kind: "repay", amount: amount ?? "ALL" };
  }

  if (/\b(health factor|credit|carry|ltv|loan)\b/i.test(text) && /\b(show|what|how|my|check)\b/i.test(text)) {
    return { kind: "show", what: "credit" };
  }

  if (/\b(show|list|what|which|how much|status)\b/i.test(text)) {
    if (/\bstream/i.test(text)) return { kind: "show", what: "streams" };
    if (/\b(calendar|ex date|dividend|upcoming)\b/i.test(text)) return { kind: "show", what: "calendar" };
    if (/\b(vault|apy|yield|lp)\b/i.test(text)) return { kind: "show", what: "vault" };
    return { kind: "show", what: "positions" };
  }

  const slippage = text.match(/slippage[^\d]*(\d+(?:\.\d+)?)\s*%?/i);
  if (slippage) {
    return { kind: "set_slippage", bps: Math.round(Number(slippage[1]) * 100) };
  }

  if (/\bdeposit\b/i.test(text)) {
    const symbol = findSymbol(text, symbols);
    const amount = findAmount(text);
    if (symbol && symbol !== "ALL" && amount) return { kind: "deposit", symbol, amount };
    return {
      kind: "unsupported",
      reason: "Tell me which stock and how many shares.",
      suggestion: 'Try "deposit 25 AAPL".',
    };
  }

  if (/\bwithdraw\b/i.test(text)) {
    const symbol = findSymbol(text, symbols);
    const amount = findAmount(text);
    if (symbol && symbol !== "ALL" && amount) return { kind: "withdraw", symbol, amount };
    return {
      kind: "unsupported",
      reason: "Tell me which stock and how many shares to take out.",
      suggestion: 'Try "withdraw 10 MSFT".',
    };
  }

  if (/\bclaim\b/i.test(text)) {
    return { kind: "claim", symbol: findSymbol(text, symbols) ?? "ALL" };
  }

  if (/\b(start|activate|kick off|begin)\b/i.test(text)) {
    return { kind: "activate", symbol: findSymbol(text, symbols) ?? "ALL" };
  }

  for (const { pattern, mode } of MODE_WORDS) {
    if (pattern.test(text)) {
      const symbol = findSymbol(text, symbols);
      if (symbol) return { kind: "set_mode", symbol, mode };
      return {
        kind: "unsupported",
        reason: "Tell me which stock, or say “all”.",
        suggestion: 'Try "reinvest all my MSFT dividends" or "stream everything".',
      };
    }
  }

  return { kind: "unknown", input: text };
}

/** Suggested commands. The honest ones and the executable ones, mixed. */
export const EXAMPLE_PROMPTS = [
  "Borrow 5000 USDG",
  "Claim everything",
  "Reinvest all my MSFT dividends",
  "Show my credit",
  "Cash out AAPL early",
  "Stream half, reinvest half",
  "Protect my portfolio this weekend",
  "Show my streams",
  "Deposit 25 AAPL",
];
