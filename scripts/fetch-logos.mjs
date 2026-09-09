#!/usr/bin/env node
/**
 * Download company logos into apps/web/public/logos/<TICKER>.svg.
 *
 * Run this from a machine with open network access — a sandboxed CI or agent container
 * usually cannot reach these hosts, which is the whole reason the logos are committed
 * rather than hotlinked. Once they are in the repo the app never talks to these hosts
 * again: no runtime dependency on someone else's CDN, and no viewer IP handed to it.
 *
 *   node scripts/fetch-logos.mjs
 *
 * Anything that fails is reported and skipped. TokenMark falls back to the monogram
 * for a missing file, so a partial run leaves a working app, not a broken one.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps", "web", "public", "logos");

/** TradingView's symbol art, keyed by their company slug rather than the ticker. */
const SLUGS = {
  AAPL: "apple",
  AMD: "advanced-micro-devices",
  AMZN: "amazon",
  GOOGL: "alphabet",
  INTC: "intel",
  META: "meta-platforms",
  MSFT: "microsoft",
  MU: "micron-technology",
  NVDA: "nvidia",
  PLTR: "palantir",
  TSLA: "tesla",
};

/**
 * Sources are tried in order per ticker. Two independent hosts because neither is ours
 * and either may move; the first that answers with something that parses as SVG wins.
 */
const SOURCES = [
  (ticker) => `https://s3-symbol-logo.tradingview.com/${SLUGS[ticker]}--big.svg`,
  (ticker) => `https://assets.parqet.com/logos/symbol/${ticker}?format=svg`,
];

mkdirSync(outDir, { recursive: true });

let saved = 0;
const failed = [];

for (const ticker of Object.keys(SLUGS)) {
  const target = join(outDir, `${ticker}.svg`);
  if (existsSync(target) && !process.argv.includes("--force")) {
    console.log(`skip  ${ticker} (already present; --force to replace)`);
    continue;
  }

  let done = false;
  for (const source of SOURCES) {
    const url = source(ticker);
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) continue;
      const body = await res.text();
      // Content type is not enough: some hosts answer a 404 page with image/svg+xml.
      // Requiring an actual <svg> root is what tells a logo from an apology.
      if (!body.trimStart().startsWith("<") || !body.includes("<svg")) continue;
      writeFileSync(target, body);
      console.log(`ok    ${ticker}  <- ${url}`);
      saved++;
      done = true;
      break;
    } catch {
      // Next source. A dead host is expected, not exceptional.
    }
  }
  if (!done) failed.push(ticker);
}

console.log(`\nSaved ${saved} logo(s) into apps/web/public/logos`);
if (failed.length > 0) {
  console.log(`No logo for: ${failed.join(", ")} — these keep the monogram, which is fine.`);
  console.log(`Drop an SVG at apps/web/public/logos/<TICKER>.svg by hand to fix one.`);
}
