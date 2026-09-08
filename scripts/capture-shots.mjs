#!/usr/bin/env node
/**
 * Recapture the documentation screenshots.
 *
 * `apps/web/src/components/docs/shots.ts` has always claimed to be "written by the
 * capture script"; the capture script was never in the repository, so the ten images
 * under `apps/web/public/docs` were taken by hand and went stale the first time the UI
 * moved. This is that script.
 *
 * Every element it photographs carries a `data-shot` attribute, so a screenshot cannot
 * silently start framing the wrong thing when a wrapper is added. It captures at 2x
 * against the demo data — which is seeded and deterministic, so two runs produce the
 * same portfolio — and writes both the WebP files and the dimension manifest the docs
 * use to reserve space before an image loads.
 *
 *   node scripts/capture-shots.mjs                  # boots its own server
 *   node scripts/capture-shots.mjs --url http://…   # uses one already running
 *
 * Requires a production build (`pnpm --filter @drip-markets/web build`) and Playwright's
 * Chromium (`npx playwright install chromium`). Playwright itself only writes PNG and
 * JPEG, so the WebP encode is handed to sharp — which the app already depends on for
 * `next/image`.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "apps/web");
const OUT = resolve(WEB, "public/docs");
const MANIFEST = resolve(WEB, "src/components/docs/shots.ts");

const argUrl = process.argv.indexOf("--url");
const BASE = argUrl > -1 ? process.argv[argUrl + 1] : null;
const PORT = 3123;

/**
 * name → where it lives.
 *
 * `pad` is the breathing room left around the element, in CSS pixels; a screenshot cut
 * exactly to a panel's border looks cropped rather than framed. `wait` is for the two
 * screens that animate a value in before they are worth photographing.
 */
const SHOTS = [
  { name: "hero", path: "/", pad: 0, wait: 1600 },
  // Not a documentation figure: the social card, written where Next's file convention
  // picks it up. Photographed rather than composed with `next/og`, because satori cannot
  // read WOFF2 and every face on this site is WOFF2.
  { name: "og", path: "/dev/og", pad: 0, wait: 1200, scale: 1, out: resolve(WEB, "src/app/opengraph-image.png") },
  { name: "dashboard", path: "/app", pad: 20 },
  { name: "deposit-modes", path: "/app/deposit", pad: 16 },
  { name: "deposit-summary", path: "/app/deposit", pad: 16 },
  { name: "vault", path: "/app/vault", pad: 20 },
  { name: "borrow", path: "/app/borrow", pad: 20 },
  { name: "split", path: "/app/split", pad: 20 },
  { name: "calendar", path: "/app/calendar", pad: 20 },
  { name: "agent", path: "/app/agent", pad: 20, wait: 2600 },
  { name: "universe", path: "/", pad: 20, scrollTo: "#universe" },
];

function startServer() {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: WEB, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((res, rej) => {
    const done = setTimeout(() => rej(new Error("next start did not become ready")), 60_000);
    child.stdout.on("data", (b) => {
      if (/ready/i.test(String(b))) {
        clearTimeout(done);
        res(child);
      }
    });
    child.on("exit", (code) => rej(new Error(`next start exited with ${code}`)));
  });
}

const server = BASE ? null : await startServer();
const base = BASE ?? `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--no-proxy-server", "--force-color-profile=srgb"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  // The garden animates; a screenshot of a half-fallen petal is noise, and the reveal
  // transitions would otherwise have to be waited out one section at a time.
  reducedMotion: "reduce",
});
const page = await context.newPage();
const manifest = {};

for (const shot of SHOTS) {
  await page.goto(base + shot.path, { waitUntil: "load", timeout: 45_000 });
  // Walk the page so every IntersectionObserver has fired before anything is captured.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  if (shot.scrollTo) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView(), shot.scrollTo);
  await page.waitForTimeout(shot.wait ?? 900);

  const el = page.locator(`[data-shot="${shot.name}"]`).first();
  await el.waitFor({ state: "visible", timeout: 15_000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${shot.name}`);

  const pad = shot.pad ?? 0;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };

  // `clip` is document-relative, so the capture has to be a full-page one — otherwise
  // anything below the fold clips to a region outside the rendered image.
  const png = await page.screenshot({ clip, type: "png", scale: "device", fullPage: true });

  if (shot.out) {
    // The social card ships at its own 1200x630, not at 2x.
    await sharp(png).resize(Math.round(clip.width), Math.round(clip.height)).png().toFile(shot.out);
    console.log(`${shot.name}  ${Math.round(clip.width)}x${Math.round(clip.height)}  -> ${shot.out}`);
    continue;
  }

  await sharp(png).webp({ quality: 88, effort: 5 }).toFile(resolve(OUT, `${shot.name}.webp`));
  manifest[shot.name] = { width: Math.round(clip.width * 2), height: Math.round(clip.height * 2) };
  console.log(`${shot.name}  ${manifest[shot.name].width}x${manifest[shot.name].height}`);
}

await browser.close();
if (server) server.kill();

const body = Object.entries(manifest)
  .map(([k, v]) => `  ${/^[a-z][a-z0-9]*$/i.test(k) ? k : `"${k}"`}: { width: ${v.width}, height: ${v.height} },`)
  .join("\n");

writeFileSync(
  MANIFEST,
  `/**
 * Intrinsic pixel sizes of the screenshots in public/docs, captured at 2x from the
 * running demo. Written by scripts/capture-shots.mjs; edit by recapturing, not by hand.
 */
export const SHOTS = {
${body}
} as const;
`
);
console.log(`\nwrote ${Object.keys(manifest).length} shots and the manifest`);
