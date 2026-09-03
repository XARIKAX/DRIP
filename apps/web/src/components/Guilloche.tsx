"use client";

import { useId, useMemo } from "react";

/**
 * Guilloché — the engine-turned line work found on share certificates and banknotes.
 *
 * This is the product's signature graphic device, and it is generated rather than
 * drawn: every figure here is a real hypotrochoid or wave-interference field, so the
 * patterns are mathematically exact the way engraved security printing is, instead of
 * being a decorative squiggle that happens to look busy.
 *
 * A rose engine cuts a hypotrochoid — a point on a circle of radius `r` rolling inside
 * a circle of radius `R`, offset by `a`:
 *
 *     x = (R − r)·cos t + a·cos((R − r)/r · t)
 *     y = (R − r)·sin t − a·sin((R − r)/r · t)
 *
 * Nesting many of those with a drifting offset produces the interference bands that
 * make engraving impossible to photocopy — and, at 6% opacity in ink, makes a white
 * page read as watermarked stock rather than as #FFF.
 *
 * Everything is memoised on its parameters and drawn once. No animation loop, no
 * per-frame cost: a rosette is a static string of path data.
 */

function hypotrochoid(R: number, r: number, a: number, steps = 720, turns = 1): string {
  const k = (R - r) / r;
  let d = "";
  const total = steps * turns;
  for (let i = 0; i <= total; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = (R - r) * Math.cos(t) + a * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - a * Math.sin(k * t);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * A rosette. `rings` nested curves, each with a slightly larger offset, which is what
 * creates the moiré banding rather than a set of concentric circles.
 */
export function Rosette({
  size = 240,
  rings = 26,
  R = 100,
  r = 31,
  a = 62,
  drift = 0.9,
  stroke = "currentColor",
  opacity = 0.5,
  strokeWidth = 0.45,
  spin,
  className = "",
}: {
  size?: number;
  rings?: number;
  R?: number;
  r?: number;
  a?: number;
  drift?: number;
  stroke?: string;
  opacity?: number;
  strokeWidth?: number;
  /** Seconds for one revolution. Omit for a static engraving. */
  spin?: number;
  className?: string;
}) {
  const paths = useMemo(
    () => Array.from({ length: rings }, (_, i) => hypotrochoid(R, r, a - i * drift)),
    [rings, R, r, a, drift]
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="-110 -110 220 220"
      className={className}
      aria-hidden
      focusable="false"
      style={
        spin
          ? { animation: `rosette-spin ${spin}s linear infinite`, transformOrigin: "center" }
          : undefined
      }
    >
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity}>
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/**
 * An engine-turned field: two sets of phase-shifted sine curves whose interference
 * produces the woven ground of a banknote. Used at very low opacity behind type.
 */
export function EngravedField({
  width = 1440,
  height = 320,
  lines = 46,
  amplitude = 26,
  frequency = 2.4,
  stroke = "currentColor",
  opacity = 0.5,
  strokeWidth = 0.5,
  className = "",
}: {
  width?: number;
  height?: number;
  lines?: number;
  amplitude?: number;
  frequency?: number;
  stroke?: string;
  opacity?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const paths = useMemo(() => {
    const out: string[] = [];
    const step = height / (lines - 1);
    for (let i = 0; i < lines; i++) {
      const y0 = i * step;
      // Amplitude swells toward the middle of the field, as a rose engine would cut it.
      const swell = Math.sin((i / (lines - 1)) * Math.PI);
      const amp = amplitude * swell;
      const phase = (i / lines) * Math.PI * 2;
      let d = "";
      for (let x = 0; x <= width; x += 8) {
        const u = (x / width) * Math.PI * 2 * frequency;
        const y = y0 + Math.sin(u + phase) * amp + Math.sin(u * 2.17 + phase * 1.6) * amp * 0.28;
        d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
      }
      out.push(d);
    }
    return out;
  }, [width, height, lines, amplitude, frequency]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity}>
        {paths.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

/**
 * A perforation. The tear line between a certificate and its dividend coupon — the
 * literal mechanism the product replaces, so it earns its place as a divider.
 */
export function Perforation({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={`relative flex items-center gap-4 ${className}`} aria-hidden>
      <Tear id={`${id}-l`} />
      {label ? (
        <span className="shrink-0 font-mono text-nano uppercase tracking-mega text-faint">
          {label}
        </span>
      ) : null}
      <Tear id={`${id}-r`} />
    </div>
  );
}

/**
 * The tear itself, drawn with a repeating gradient rather than a dashed SVG stroke:
 * under `preserveAspectRatio="none"` the horizontal scale distorts dash spacing, which
 * is why the SVG version rendered as nothing at all. Gradients scale predictably.
 */
function Tear({ id }: { id: string }) {
  return (
    <span
      key={id}
      className="h-px flex-1"
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 8px)",
        maskImage: "linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)",
      }}
    />
  );
}

/**
 * An engraved band — the woven strip printed across the head and foot of a certificate.
 *
 * This replaced four corner rosettes: quarter-cropped rosettes read as smudges at low
 * opacity, whereas a band is unambiguously *printing*. It also states the format of the
 * document, which is what an engraved border is actually for.
 */
export function EngravedBand({
  height = 26,
  className = "",
  flip = false,
}: {
  height?: number;
  className?: string;
  flip?: boolean;
}) {
  return (
    <EngravedField
      width={900}
      height={height}
      lines={9}
      amplitude={height * 0.34}
      frequency={13}
      opacity={1}
      strokeWidth={0.6}
      className={`${className} ${flip ? "rotate-180" : ""}`}
    />
  );
}

/**
 * The corner ornament of an engraved document: a quarter of a rosette, cropped by the
 * corner it sits in. Four of these frame a certificate without a heavy border.
 */
export function CornerOrnament({
  size = 96,
  corner = "tl",
  className = "",
}: {
  size?: number;
  corner?: "tl" | "tr" | "bl" | "br";
  className?: string;
}) {
  const rotate = { tl: 0, tr: 90, br: 180, bl: 270 }[corner];
  return (
    <div
      className={`pointer-events-none absolute overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        [corner.includes("t") ? "top" : "bottom"]: 0,
        [corner.includes("l") ? "left" : "right"]: 0,
      }}
      aria-hidden
    >
      <div
        style={{
          transform: `rotate(${rotate}deg) translate(-50%, -50%)`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <Rosette size={size * 2} rings={14} R={100} r={23} a={70} drift={2.2} opacity={0.5} />
      </div>
    </div>
  );
}
