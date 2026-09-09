"use client";

import { useState } from "react";

/**
 * Token identity: the company's own logo where the repo has one, a monogram where not.
 *
 * Logos are served from `public/logos/<TICKER>.svg` in this repo — no third party CDN
 * at runtime, so the page cannot be broken by someone else's outage and no viewer's IP
 * is handed to a host they did not ask to talk to. `scripts/fetch-logos.mjs` fills that
 * folder from a machine with open network access.
 *
 * The art is a full bleed tile: each file paints its own background across the whole
 * viewbox and knocks the mark out of it. So the logo runs edge to edge and the wrapper
 * only rounds and clips it — insetting it over a second background would read as a
 * badge floating inside another badge.
 *
 * The monogram is the fallback for both a missing file and one that fails to decode,
 * which `onError` catches at runtime. It keeps its own ground and border because it is
 * type rather than art, and needs the tile drawn for it.
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

  if (failed) {
    const letters = symbol.slice(0, symbol.length > 3 ? 2 : 1);
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-ground-3 font-sans font-bold tracking-tight text-ink"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {letters}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-line"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/logos/${symbol.toUpperCase()}.svg`}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
