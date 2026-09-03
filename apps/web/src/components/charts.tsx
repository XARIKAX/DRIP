"use client";

import { useId } from "react";

/**
 * Every chart in the product is an inline SVG built from the same data the tables show.
 * No chart library, no external assets, nothing that cannot draw itself in under a
 * millisecond. Lines draw left to right on first view; fills follow.
 *
 * On a dark canvas the accent carries direction, so a rising series is cyan and only a
 * falling one takes the red — colour is used to say something, not to decorate.
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

/** Inline sparkline for table rows. */
export function Sparkline({
  points,
  width = 96,
  height = 26,
  up,
}: {
  points: number[];
  width?: number;
  height?: number;
  up: boolean;
  dark?: boolean;
}) {
  const { line } = toPath(points, width, height);
  const stroke = up ? "#35C2DB" : "#FF6B6B";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="block"
      role="presentation"
    >
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        opacity={up ? 1 : 0.9}
      />
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

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="block w-full"
        role="img"
        aria-label="History chart"
      >
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#35C2DB" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#35C2DB" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1="0"
            x2={w}
            y1={height * p}
            y2={height * p}
            stroke="rgba(255,255,255,0.055)"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill={`url(#fill-${id})`} className="chart-fill" />
        <path d={line} fill="none" stroke="#35C2DB" strokeWidth="1.75" pathLength={1} className="draw-line" />
      </svg>
      {(labelLeft || labelRight) && (
        <div className="mt-3 flex justify-between font-mono text-nano uppercase text-panel-faint">
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

/** Thin horizontal meter with an optional cap marker. Used for utilisation and health. */
export function Meter({ pct, capPct }: { pct: number; capPct?: number; dark?: boolean }) {
  return (
    <div className="relative h-1.5 w-full bg-panel-3">
      <div
        className="h-1.5 bg-cyan transition-[width] duration-700 ease-osk"
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
      {capPct !== undefined ? (
        <div
          className="absolute top-[-4px] h-[14px] w-px bg-panel-text"
          style={{ left: `${Math.min(capPct, 100)}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
