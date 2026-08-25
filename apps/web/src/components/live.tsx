"use client";

import { useEffect, useRef, useState } from "react";
import { streamClaimable, type StreamRow } from "@/lib/data/types";

/**
 * Everything on screen that moves, moves through this file.
 *
 * The rules: numbers never jump, they interpolate; anything that accrues ticks
 * continuously at the display's frame rate; a value that changes flashes cyan once;
 * and prefers-reduced-motion turns interpolation into a snap without turning the
 * data stale.
 */

export function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Interpolates to each new value over ~500ms with an ease out. */
export function AnimatedNumber({
  value,
  decimals = 2,
  prefix = "",
  suffix = "",
  className = "",
  flash = "none",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  flash?: "none" | "light" | "dark";
}) {
  const [display, setDisplay] = useState(value);
  const shownRef = useRef(value);
  const [flashKey, setFlashKey] = useState(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (from === to) return;

    if (mountedRef.current && flash !== "none") setFlashKey((k) => k + 1);
    mountedRef.current = true;

    if (reducedMotion()) {
      shownRef.current = to;
      setDisplay(to);
      return;
    }

    const t0 = performance.now();
    const duration = 500;
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      shownRef.current = v;
      setDisplay(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, flash]);

  const flashClass = flash === "light" ? "flash-light" : flash === "dark" ? "flash-dark" : "";

  return (
    <span key={flashKey} className={`num ${flashKey > 0 ? flashClass : ""} ${className}`}>
      {prefix}
      {fmt(display, decimals)}
      {suffix}
    </span>
  );
}

/** Ticks continuously: base value plus a per second rate, sampled every frame. */
export function LiveCounter({
  base,
  ratePerSec,
  decimals = 4,
  prefix = "",
  className = "",
}: {
  base: number;
  ratePerSec: number;
  decimals?: number;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(base);
  const anchorRef = useRef({ base, at: Date.now() });

  useEffect(() => {
    anchorRef.current = { base, at: Date.now() };
    setDisplay(base);
  }, [base]);

  useEffect(() => {
    if (ratePerSec <= 0) return;
    let frame = 0;
    const interval = reducedMotion() ? 1000 : 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= interval) {
        last = t;
        const { base: b, at } = anchorRef.current;
        setDisplay(b + ((Date.now() - at) / 1000) * ratePerSec);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ratePerSec]);

  return (
    <span className={`num ${className}`}>
      {prefix}
      {fmt(display, decimals)}
    </span>
  );
}

/** A stream's accrued-but-unclaimed value, ticking against the wall clock. */
export function StreamTicker({
  stream,
  decimals = 4,
  prefix = "$",
  className = "",
}: {
  stream: StreamRow;
  decimals?: number;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => streamClaimable(stream, Date.now()));

  useEffect(() => {
    setDisplay(streamClaimable(stream, Date.now()));
    if (stream.closed) return;
    let frame = 0;
    const interval = reducedMotion() ? 1000 : 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= interval) {
        last = t;
        setDisplay(streamClaimable(stream, Date.now()));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stream]);

  return (
    <span className={`num ${className}`}>
      {prefix}
      {fmt(display, decimals)}
    </span>
  );
}

/** Live countdown to a unix timestamp, to the second: "4d 07:31:22". */
export function Countdown({ to, className = "" }: { to: number; className?: string }) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(to - nowSec, 0);
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor((remaining % 86_400) / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const seconds = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className={`num ${className}`}>
      {days > 0 ? `${days}d ` : ""}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}

/** "6d ago" / "in 12d" / "just now". */
export function relativeTime(ts: number): string {
  if (!ts) return "onchain";
  const delta = Math.floor(Date.now() / 1000) - ts;
  const abs = Math.abs(delta);
  const unit =
    abs >= 86_400 ? `${Math.floor(abs / 86_400)}d` : abs >= 3_600 ? `${Math.floor(abs / 3_600)}h` : abs >= 60 ? `${Math.floor(abs / 60)}m` : null;
  if (!unit) return delta >= 0 ? "just now" : "moments away";
  return delta >= 0 ? `${unit} ago` : `in ${unit}`;
}

/** Short calendar date. */
export function shortDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
