"use client";

import { useId } from "react";

/**
 * Every chart in the product is an inline SVG built from the same data the tables
 * show. No chart library, no external assets, nothing that cannot draw itself in
 * under a millisecond. Lines draw left to right on first view; fills fade in after.
 */

function toPath(points: number[], w: number, h: number, pad = 2): { line: string; area: string } {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (h - pad * 2) * (1 - (v - min) / span);
  let line = "";
  points.forEach((p, i) => {
    line += `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(2)},${y(p).toFixed(2)}`;
  });
  const area = `${line}L${(pad + (points.length - 1) * step).toFixed(2)},${h - pad}L${pad},${h - pad}Z`;
  return { line, area };
}

/** 60 point inline sparkline for table rows. */
export function Sparkline({
  points,
  width = 96,
  height = 26,
  up,
  dark = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  up: boolean;
  dark?: boolean;
}) {
  const { line } = toPath(points, width, height);
  const stroke = up ? (dark ? "#35C2DB" : "#0E8A5F") : "#C0392B";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="block"
      role="presentation"
    >
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Area chart with a draw-in trace. Used for the vault's yield history. */
export function AreaChart({
  points,
  height = 220,
  labelLeft,
  labelRight,
  formatValue = (v: number) => v.toFixed(1),
  dark = true,
}: {
  points: number[];
  height?: number;
  labelLeft?: string;
  labelRight?: string;
  formatValue?: (v: number) => string;
  dark?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const w = 800;
  const { line, area } = toPath(points, w, height, 4);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const axis = dark ? "#4A5058" : "#6B6B6B";
  const grid = dark ? "#15181B" : "#E5E5E5";

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="block w-full" role="img" aria-label="History chart">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#35C2DB" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#35C2DB" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1="0" x2={w} y1={height * p} y2={height * p} stroke={grid} strokeWidth="1" />
        ))}
        <path d={area} fill={`url(#fill-${id})`} className="chart-fill" />
        <path
          d={line}
          fill="none"
          stroke="#35C2DB"
          strokeWidth="2"
          pathLength={1}
          className="draw-line"
        />
      </svg>
      {(labelLeft || labelRight) && (
        <div className="mt-2 flex justify-between text-micro font-bold uppercase" style={{ color: axis }}>
          <span>
            {labelLeft} · <span className="num">{formatValue(min)}</span> low
          </span>
          <span>
            {labelRight} · <span className="num">{formatValue(max)}</span> high
          </span>
        </div>
      )}
    </div>
  );
}

/** Thin horizontal meter with an optional cap marker. Used for utilisation. */
export function Meter({
  pct,
  capPct,
  dark = true,
}: {
  pct: number;
  capPct?: number;
  dark?: boolean;
}) {
  return (
    <div className={`relative h-2 w-full ${dark ? "bg-panel-line" : "bg-faint"}`}>
      <div className="h-2 bg-cyan transition-[width] duration-500 ease-drip" style={{ width: `${Math.min(pct, 100)}%` }} />
      {capPct !== undefined ? (
        <div
          className={`absolute top-[-3px] h-[14px] w-px ${dark ? "bg-paper" : "bg-ink"}`}
          style={{ left: `${Math.min(capPct, 100)}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
