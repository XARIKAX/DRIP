"use client";

import { useEffect, useRef, useState } from "react";
import { formatStreaming } from "@drip/sdk";

/**
 * The signature interaction.
 *
 * The chain is polled every few seconds. Between polls this interpolates forward at
 * the stream's own per second rate, so the number moves continuously instead of
 * jumping. When a fresh poll lands it snaps to truth: the display never drifts away
 * from what the contract would actually pay.
 */
export function StreamCounter({
  claimable,
  ratePerSecondScaled,
  end,
  closed,
  className = "",
}: {
  /** Claimable USDG, 6 decimals, as of the last poll. */
  claimable: bigint;
  /** USDG per second scaled by 1e18. */
  ratePerSecondScaled: bigint;
  /** Stream end timestamp in seconds. Accrual stops here. */
  end: number;
  closed: boolean;
  className?: string;
}) {
  const base = Number(claimable) / 1e6;
  const ratePerSecond = Number(ratePerSecondScaled) / 1e18 / 1e6;

  const [displayed, setDisplayed] = useState(base);
  const anchorRef = useRef({ value: base, at: Date.now() });

  // Every poll re snaps the anchor to the contract's answer.
  useEffect(() => {
    anchorRef.current = { value: base, at: Date.now() };
    setDisplayed(base);
  }, [base]);

  useEffect(() => {
    if (closed || ratePerSecond <= 0) return;
    let frame = 0;
    const tick = () => {
      const { value, at } = anchorRef.current;
      const elapsed = (Date.now() - at) / 1000;
      const cappedElapsed = Math.max(0, Math.min(elapsed, end - at / 1000));
      setDisplayed(value + cappedElapsed * ratePerSecond);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [closed, ratePerSecond, end]);

  return (
    <span className={`num tabular-nums ${className}`} aria-live="off">
      {formatStreaming(displayed)}
    </span>
  );
}
