"use client";

import { useState } from "react";

/**
 * Token identity: the company's own logo where we have one, a monogram where we do not.
 *
 * The logo is served from `public/logos/<TICKER>.svg` in this repo — no third party CDN
 * at runtime, so the page cannot be broken by someone else's outage, and no viewer's IP
 * is handed to a host they did not ask to talk to. `scripts/fetch-logos.mjs` fills that
 * folder; anything it could not get falls through to the monogram, which is a complete
 * and deliberate design rather than a placeholder for a missing file.
 *
 * The fallback also covers the file being there and failing to decode, which `onError`
 * catches at runtime. A stock the app knows about but has no art for still renders.
 */
export function TokenMark({
  symbol,
  size = 32,
  dark = false,
}: {
  symbol: string;
  size?: number;
  /** Kept so existing call sites still typecheck; the surface decides now. */
  dark?: boolean;
}) {
  void dark;
  const [failed, setFailed] = useState(false);
  const letters = symbol.slice(0, symbol.length > 3 ? 2 : 1);

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-ground-3 font-sans font-bold tracking-tight text-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {failed ? (
        letters
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/logos/${symbol.toUpperCase()}.svg`}
          alt=""
          width={size}
          height={size}
          // Inset a touch: most of these marks are drawn to the edge of their viewbox
          // and butt against the rounded corner without it.
          style={{ width: size * 0.68, height: size * 0.68, objectFit: "contain" }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
