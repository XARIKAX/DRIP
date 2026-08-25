"use client";

import { useEffect, useRef, useState } from "react";
import { formatStreaming } from "@drip/sdk";

/**
 * The hero number. It ticks because the product ticks.
 *
 * This is a display counter, not a chain read: it shows what a dividend stream looks
 * like at protocol scale. The dashboard's counters are the real thing, wired to
 * claimable() on a live stream.
 */
export function HeroCounter({
  start = 184_209.4412,
  ratePerSecond = 0.7318,
}: {
  start?: number;
  ratePerSecond?: number;
}) {
  const [value, setValue] = useState(start);
  const mounted = useRef(Date.now());

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setValue(start + ((Date.now() - mounted.current) / 1000) * ratePerSecond);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, ratePerSecond]);

  return <span className="num tabular-nums">{formatStreaming(value)}</span>;
}
