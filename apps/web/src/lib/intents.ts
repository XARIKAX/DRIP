import { Mode } from "@drip-markets/sdk";

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
  | { kind: "set_mode"; symbol: string | "ALL"; mode: Mode }
  | { kind: "claim"; symbol: string | "ALL" }
  | { kind: "activate"; symbol: string | "ALL" }
  | { kind: "deposit"; symbol: string; amount: string }
  | { kind: "withdraw"; symbol: string; amount: string }
  | { kind: "set_slippage"; bps: number }
  | { kind: "show"; what: "positions" | "streams" | "calendar" | "vault" }
  | { kind: "unsupported"; reason: string; suggestion: string }
  | { kind: "unknown"; input: string };

const MODE_WORDS: { pattern: RegExp; mode: Mode }[] = [
  { pattern: /\b(reinvest|compound|drip|buy more)\b/i, mode: Mode.REINVEST },
  { pattern: /\b(stream|drip out|per second|trickle)\b/i, mode: Mode.STREAM },
  { pattern: /\b(cash|early|lump|pay me now|take it now|upfront)\b/i, mode: Mode.CASH_EARLY },
];

/** Pull the first known ticker out of a sentence, or ALL when the user said everything. */
function findSymbol(text: string, symbols: string[]): string | "ALL" | null {
  const upper = text.toUpperCase();
  for (const symbol of symbols) {
    if (new RegExp(`\\b${symbol}\\b`).test(upper)) return symbol;
  }
  if (/\b(all|everything|every|each)\b/i.test(text)) return "ALL";
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
 * @param symbols Tickers the protocol actually knows about on this chain.
 */
export function parseIntent(input: string, symbols: string[]): Intent {
  const text = input.trim();
  if (!text) return { kind: "unknown", input };

  // Cross token reinvestment. The protocol buys back the token that paid the dividend,
  // on purpose, so say so rather than silently doing something else.
  const crossToken = text.match(/\b(?:reinvest|compound|drip)\b[^]*?\binto\b\s+([A-Za-z]{1,6})\b/i);
  if (crossToken) {
    const target = crossToken[1]!.toUpperCase();
    const source = findSymbol(text.replace(crossToken[0], ""), symbols);
    if (symbols.includes(target) && source && source !== target) {
      return {
        kind: "unsupported",
        reason: `Reinvestment buys back the token that paid the dividend. ${source} dividends buy ${source}, never ${target}.`,
        suggestion: `Set ${source} to Cash early, then buy ${target} yourself. Two steps, no hidden routing.`,
      };
    }
  }

  // Splitting one position across two modes. Mode is per token, so this cannot be done
  // on a single token without splitting the position itself.
  if (/\bhalf\b[^]*\bhalf\b/i.test(text) || /\bsplit\b/i.test(text)) {
    return {
      kind: "unsupported",
      reason: "Mode is a per token setting. One position cannot stream half and compound half at the same time.",
      suggestion:
        "Withdraw half into a second wallet and set a different mode there, or set one token to Stream and another to Reinvest.",
    };
  }

  if (/\b(show|list|what|which|how much|status)\b/i.test(text)) {
    if (/\bstream/i.test(text)) return { kind: "show", what: "streams" };
    if (/\b(calendar|ex date|dividend|upcoming)\b/i.test(text)) return { kind: "show", what: "calendar" };
    if (/\b(vault|apy|yield|lp)\b/i.test(text)) return { kind: "show", what: "vault" };
    return { kind: "show", what: "positions" };
  }

  const slippage = text.match(/slippage[^\d]*(\d+(?:\.\d+)?)\s*%?/i);
  if (slippage) {
    const percent = Number(slippage[1]);
    return { kind: "set_slippage", bps: Math.round(percent * 100) };
  }

  if (/\bdeposit\b/i.test(text)) {
    const symbol = findSymbol(text, symbols);
    const amount = findAmount(text);
    if (symbol && symbol !== "ALL" && amount) return { kind: "deposit", symbol, amount };
    return {
      kind: "unsupported",
      reason: "A deposit needs both a ticker and an amount.",
      suggestion: 'Try "deposit 25 AAPL".',
    };
  }

  if (/\bwithdraw\b/i.test(text)) {
    const symbol = findSymbol(text, symbols);
    const amount = findAmount(text);
    if (symbol && symbol !== "ALL" && amount) return { kind: "withdraw", symbol, amount };
    return {
      kind: "unsupported",
      reason: "A withdrawal needs both a ticker and an amount.",
      suggestion: 'Try "withdraw 10 KO".',
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
        reason: "That mode change needs a ticker, or the word all.",
        suggestion: 'Try "reinvest all my KO dividends" or "stream everything".',
      };
    }
  }

  return { kind: "unknown", input: text };
}

/** Example prompts shown in the console. Every one of these parses. */
export const EXAMPLE_PROMPTS = [
  "reinvest all my KO dividends",
  "stream everything",
  "cash out AAPL early",
  "claim all my streams",
  "start my dividends",
  "deposit 25 AAPL",
  "set slippage to 2%",
  "show my streams",
];
