"use client";

import { useEffect, useRef, useState } from "react";

import { monogram, type BuilderAsset } from "@/lib/stack/asset";
import { stackAccent } from "@/lib/palette";

/**
 * An asset's face, wherever it comes from.
 *
 * Three sources and one shape. A stock resolves a file this repo ships at
 * `/logos/<TICKER>.svg`. An imported token carries a URL from whatever indexed it. A
 * token nobody has drawn — or a logo that fails to load — gets a monogram on its own
 * ring colour, which is the same fallback `TokenMark` has always used and is why a
 * missing picture never leaves a hole in the ring.
 *
 * The remote image is deliberately loaded WITHOUT `crossOrigin`. The CDN serving these
 * sends no `access-control-allow-origin`, and asking for CORS on a host that does not
 * offer it fails the request outright — so the picture would vanish in exchange for a
 * permission nothing here needs. Displaying an image has never required CORS. What does
 * require it is reading pixels back out, which is why the PNG export draws the monogram
 * for imported tokens instead of the logo: see `lib/stack/card.ts`.
 */
/** How long a logo gets before the monogram takes its place. */
const LOGO_TIMEOUT_MS = 4000;

export function AssetMark({
  asset,
  size = 34,
  slot = 0,
  className = "",
}: {
  asset: Pick<BuilderAsset, "kind" | "symbol" | "logoUrl">;
  size?: number;
  slot?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);
  const src =
    asset.kind === "stock" ? `/logos/${asset.symbol.toUpperCase()}.svg` : asset.logoUrl;

  // A new src deserves a fresh chance: without this, one broken logo poisons the slot
  // for every asset that later reuses this element.
  useEffect(() => setFailed(false), [src]);

  /*
   * `onError` is not enough, and the gap is easy to miss.
   *
   * A host that refuses fast fires `error` and the monogram takes over. A host that
   * simply never answers — a CDN behind a captive portal, a blocked egress, a phone
   * that lost signal mid-request — fires nothing at all, and the element sits there as
   * an empty square for as long as the page is open. Which is exactly what it did here
   * the first time. So a logo gets a few seconds and then gives way to the initials,
   * because a token with no picture should still look like something.
   */
  useEffect(() => {
    if (!src || failed) return;
    const timer = setTimeout(() => {
      const node = img.current;
      if (!node || !node.complete || node.naturalWidth === 0) setFailed(true);
    }, LOGO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [src, failed]);

  if (!src || failed) {
    const accent = stackAccent(slot, asset.kind);
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-md font-sans font-bold tracking-tight ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.38),
          // A tint of its own ring colour, so an unillustrated token still reads as the
          // same thing in the list and on the arc.
          background: `color-mix(in srgb, ${accent} 22%, rgb(var(--night-3)))`,
          border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
          color: accent,
        }}
      >
        {monogram(asset.symbol)}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 overflow-hidden rounded-md border border-line ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt=""
        width={size}
        height={size}
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
