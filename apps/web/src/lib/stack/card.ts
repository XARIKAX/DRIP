/**
 * The Stack, as a picture you can send someone.
 *
 * Painted on a 2D canvas rather than screenshotted, and painted from the *same*
 * `segments()` the live ring uses — so the card is a photograph of the thing the person
 * built, not a second drawing that happens to look similar. There is one conversion in
 * this file and it is the only place in the codebase that adjusts an angle: the ring's
 * degrees run clockwise from twelve o'clock, and `ctx.arc` measures from three, so
 * everything drawn here goes through `toCanvas`.
 *
 * Every unminted card carries a PREVIEW mark, and it runs through the middle rather than
 * sitting in a corner, because a corner is the first thing a crop removes. There is no
 * profit, no loss and no performance on it — none of those exist, and inventing them on
 * an image built to be shared would be the most damaging thing this feature could do.
 */

import { formatPct, type Allocation } from "./allocation";
import { segments, toRad } from "./geometry";
import { PALETTE, stackAccent, SVG_DISPLAY, SVG_MONO, SVG_SANS } from "@/lib/palette";

const W = 1600;
const H = 1000;
const CX = 470;
const CY = 545;
const R = 285;
const RING_W = 66;

export interface CardInput {
  name: string;
  ticker: string;
  allocations: readonly Allocation[];
  /** Ticker to company name, for the legend. */
  names: Record<string, string>;
}

/**
 * Wait for the faces this card actually asks for.
 *
 * `document.fonts.ready` alone is not enough, and the way it fails is nasty: it resolves
 * for the faces *currently in use on the page*, and the canvas asks for weights and
 * sizes the page may never have rendered. So the first export silently comes out in
 * Helvetica, and the second — after the page has warmed the cache — comes out right.
 * Loading each face explicitly first removes the difference between the two.
 */
async function waitForFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const faces = [
    `800 76px ${SVG_DISPLAY}`,
    `600 30px ${SVG_SANS}`,
    `500 22px ${SVG_MONO}`,
    `600 26px ${SVG_MONO}`,
    `700 76px ${SVG_MONO}`,
  ];
  await Promise.all(
    faces.map((f) => document.fonts.load(f).catch(() => undefined))
  );
  await document.fonts.ready;
}

/**
 * A logo, or null.
 *
 * `decode()` rather than an `onload` promise: it resolves only once the bitmap is
 * genuinely ready to draw — an `onload` on an SVG can fire a moment before that in
 * Safari — and it rejects on failure, which hands us the fallback branch for free.
 *
 * These files are same-origin, so the canvas is never tainted and `toBlob` works.
 * Setting `crossOrigin` would turn a same-origin fetch into a CORS one for no benefit,
 * so it is deliberately not set.
 */
async function loadLogo(symbol: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = `/logos/${symbol.toUpperCase()}.svg`;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** The same monogram `TokenMark` falls back to, so the card agrees with the page. */
function drawMonogram(
  ctx: CanvasRenderingContext2D,
  symbol: string,
  x: number,
  y: number,
  size: number
) {
  const letters = symbol.slice(0, symbol.length > 3 ? 2 : 1);
  ctx.save();
  ctx.fillStyle = PALETTE.night[4];
  roundRect(ctx, x, y, size, size, size * 0.24);
  ctx.fill();
  ctx.fillStyle = PALETTE.night.text;
  ctx.font = `600 ${Math.round(size * 0.4)}px ${SVG_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letters, x + size / 2, y + size / 2 + 1);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Ring degrees (clockwise from twelve) to canvas radians (from three o'clock). */
function toCanvas(deg: number): number {
  return toRad(deg - 90);
}

export async function renderStackCard(input: CardInput): Promise<Blob> {
  await waitForFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser will not draw the picture.");

  const logos = await Promise.all(input.allocations.map((a) => loadLogo(a.assetId)));
  const segs = segments(input.allocations.map((a) => a.weightBps));
  const colors = input.allocations.map((a) => stackAccent(a.slot));

  /* ---- ground ---- */
  ctx.fillStyle = PALETTE.night[1];
  ctx.fillRect(0, 0, W, H);

  const wash = ctx.createRadialGradient(CX, CY - 120, 40, CX, CY, 760);
  wash.addColorStop(0, "rgba(123, 47, 247, 0.30)");
  wash.addColorStop(1, "rgba(123, 47, 247, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  /* ---- header ---- */
  ctx.fillStyle = PALETTE.night.muted;
  ctx.font = `500 22px ${SVG_MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText((input.name.trim() || "Untitled Stack").toUpperCase(), 88, 108);

  ctx.fillStyle = PALETTE.night.text;
  ctx.font = `800 76px ${SVG_DISPLAY}`;
  ctx.fillText(`$${input.ticker || "—"}`, 88, 186);

  ctx.fillStyle = PALETTE.night.muted;
  ctx.font = `600 26px ${SVG_SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("Osinko", W - 88, 120);

  /* ---- the empty track, so gaps show a groove rather than the background ---- */
  ctx.beginPath();
  ctx.arc(CX, CY, R - RING_W / 2, 0, Math.PI * 2);
  ctx.lineWidth = RING_W;
  ctx.strokeStyle = "rgba(233, 224, 255, 0.07)";
  ctx.stroke();

  /* ---- the ring ---- */
  segs.forEach((s, i) => {
    ctx.beginPath();
    if (segs.length === 1) {
      // One holding is one continuous path. Stroking it as an arc from 0 to 360 leaves
      // a visible join at the start angle; a full circle in one call does not.
      ctx.arc(CX, CY, R - RING_W / 2, 0, Math.PI * 2);
    } else {
      ctx.arc(CX, CY, R - RING_W / 2, toCanvas(s.drawStartDeg), toCanvas(s.drawEndDeg));
    }
    ctx.lineWidth = RING_W;
    // `butt`, never `round`. Round caps add half the ring's width of arc at each end and
    // close the very gaps the geometry opened.
    ctx.lineCap = "butt";
    ctx.strokeStyle = colors[i] ?? PALETTE.iris[400];
    ctx.stroke();
  });

  /* ---- badges on the ring ---- */
  const BADGE = 62;
  segs.forEach((s, i) => {
    const a = input.allocations[i];
    if (!a) return;
    const rad = toCanvas(s.midDeg);
    const bx = CX + (R - RING_W / 2) * Math.cos(rad) - BADGE / 2;
    const by = CY + (R - RING_W / 2) * Math.sin(rad) - BADGE / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + BADGE / 2, by + BADGE / 2, BADGE / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.night[1];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors[i] ?? PALETTE.iris[400];
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bx + BADGE / 2, by + BADGE / 2, BADGE / 2, 0, Math.PI * 2);
    ctx.clip();
    const logo = logos[i];
    if (logo) ctx.drawImage(logo, bx, by, BADGE, BADGE);
    else drawMonogram(ctx, a.assetId, bx, by, BADGE);
    ctx.restore();
  });

  /* ---- hub ---- */
  ctx.fillStyle = PALETTE.night.faint;
  ctx.font = `500 20px ${SVG_MONO}`;
  ctx.textAlign = "center";
  ctx.fillText("YOUR STACK", CX, CY + 10);

  /* ---- legend ---- */
  let y = 300;
  ctx.textAlign = "left";
  for (let i = 0; i < input.allocations.length; i++) {
    const a = input.allocations[i]!;
    ctx.fillStyle = colors[i] ?? PALETTE.iris[400];
    ctx.beginPath();
    ctx.arc(900, y - 9, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.night.text;
    ctx.font = `600 30px ${SVG_SANS}`;
    ctx.fillText(a.assetId, 930, y);

    ctx.fillStyle = PALETTE.night.muted;
    ctx.font = `500 22px ${SVG_SANS}`;
    const label = input.names[a.assetId] ?? "";
    if (label) ctx.fillText(label, 1040, y);

    ctx.fillStyle = PALETTE.night.text;
    ctx.font = `600 30px ${SVG_MONO}`;
    ctx.textAlign = "right";
    ctx.fillText(`${formatPct(a.weightBps)}%`, W - 88, y);
    ctx.textAlign = "left";

    y += 62;
  }

  /* ---- the mark, through the middle where a crop cannot take it ---- */
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = PALETTE.night.text;
  ctx.font = `700 76px ${SVG_MONO}`;
  ctx.textAlign = "center";
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0.3em";
  }
  ctx.fillText("PREVIEW", 0, 0);
  ctx.restore();

  /* ---- the sentence, at full strength, where it will actually be read ---- */
  ctx.fillStyle = PALETTE.night.muted;
  ctx.font = `500 22px ${SVG_SANS}`;
  ctx.textAlign = "left";
  ctx.fillText("A preview. This is a plan, not a fund — there is no Stack token.", 88, H - 68);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be saved."))),
      "image/png"
    );
  });
}

/** Render and hand it to the browser as a download. */
export async function downloadStackCard(input: CardInput): Promise<void> {
  const blob = await renderStackCard(input);
  const url = URL.createObjectURL(blob);
  const slug =
    (input.ticker || input.name.trim() || "stack")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "stack";

  const link = document.createElement("a");
  link.href = url;
  link.download = `osinko-${slug}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a tick to start before the blob is thrown away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
