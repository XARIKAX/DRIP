"use client";

import { useEffect, useRef, useState } from "react";

import {
  clampWeight,
  formatPct,
  fromPctInput,
  TOTAL_BPS,
  toPct,
  type Allocation,
} from "@/lib/stack/allocation";
import { stackAccent } from "@/lib/palette";

/**
 * The numbers under the ring, and the only place they can be edited.
 *
 * This list is also the accessible version of the chamber. The ring above is marked
 * decorative, because it is a picture of exactly this: every holding here is a labelled
 * slider and a labelled field carrying the same share the arc does. A screen reader gets
 * one clean list of stocks and percentages instead of a stream of rotating ornament.
 *
 * ### The baseline
 *
 * The subtle bug this component exists to avoid: a slider drag fires sixty times a
 * second, and if each of those calls rescales the *already rescaled* array, the untouched
 * holdings drift against each other a basis point at a time. Drag NVDA from 50 to 55 and
 * back, and a 3:2 split between the other two has quietly become 2.997:2.003 — nobody
 * asked for that and nobody can undo it.
 *
 * So the drag freezes a baseline on the way in and scales from that same array on every
 * frame. One drag is one edit, no matter how many events it emits, and letting go where
 * you started really does put everything back where it was.
 */

export interface AllocationControlsProps {
  allocations: readonly Allocation[];
  names: Record<string, string>;
  /** Called with the baseline the edit should be computed against. */
  onSetWeight: (assetId: string, weightBps: number, baseline: readonly Allocation[]) => void;
  onRemove: (assetId: string) => void;
}

export function AllocationControls({
  allocations,
  names,
  onSetWeight,
  onRemove,
}: AllocationControlsProps) {
  // Frozen at the start of a drag or a focus, released when it ends.
  const baseline = useRef<readonly Allocation[] | null>(null);
  const live = useRef(allocations);
  live.current = allocations;

  const begin = () => {
    baseline.current = live.current;
  };
  const end = () => {
    baseline.current = null;
  };
  const set = (assetId: string, bps: number) => {
    onSetWeight(assetId, bps, baseline.current ?? live.current);
  };

  const single = allocations.length === 1;

  if (allocations.length === 0) return null;

  return (
    <div className="border-t border-line">
      <ul>
        {allocations.map((allocation) => (
          <WeightRow
            key={allocation.assetId}
            allocation={allocation}
            name={names[allocation.assetId] ?? allocation.assetId}
            count={allocations.length}
            locked={single}
            onBegin={begin}
            onEnd={end}
            onSet={(bps) => set(allocation.assetId, bps)}
            onRemove={() => onRemove(allocation.assetId)}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line px-5 py-3.5">
        <span className="text-[13px] text-muted">
          {allocations.length} {allocations.length === 1 ? "stock" : "stocks"}
        </span>
        <span className="num text-[13px] font-semibold text-accent">100% allocated</span>
      </div>

      <p className="px-5 pb-4 text-[12px] leading-relaxed text-faint">
        {single
          ? "One stock takes the whole Stack. Add another to split it."
          : "Move one and the others adjust to keep the total at 100%."}
      </p>
    </div>
  );
}

function WeightRow({
  allocation,
  name,
  count,
  locked,
  onBegin,
  onEnd,
  onSet,
  onRemove,
}: {
  allocation: Allocation;
  name: string;
  count: number;
  locked: boolean;
  onBegin: () => void;
  onEnd: () => void;
  onSet: (bps: number) => void;
  onRemove: () => void;
}) {
  // The field holds its own text while it is being typed in. Committing every keystroke
  // to canonical state would rewrite "1" into "1%" and then fight the next character;
  // a half-typed number is not yet a number and is allowed to sit there as text.
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const accent = stackAccent(allocation.slot);
  const shown = text ?? formatPct(allocation.weightBps);

  // The field is too narrow for a message beside it, so the red border *is* the
  // message — and a message that never goes away stops being one. It clears itself,
  // and clears on the next touch, so the field is never left looking broken over an
  // "abc" somebody typed and abandoned two minutes ago.
  useEffect(() => {
    if (!invalid) return;
    const t = setTimeout(() => setInvalid(false), 1600);
    return () => clearTimeout(t);
  }, [invalid]);

  const commit = () => {
    if (text === null) return;
    const bps = fromPctInput(text);
    if (bps === null) {
      setInvalid(true);
      setText(null);
    } else {
      setInvalid(false);
      onBegin();
      onSet(clampWeight(bps, count));
      onEnd();
      setText(null);
    }
  };

  return (
    <li className="flex items-center gap-3 border-b border-line-soft px-5 py-3 last:border-b-0">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: accent }}
      />
      <span className="w-[54px] shrink-0 text-[13px] font-extrabold tracking-tight text-ink">
        {allocation.assetId}
      </span>

      {/*
       * `min` is 0, not MIN_BPS, and that one character matters. A range input can only
       * land on `min + k * step`, so min=1 with a 1% step makes 1, 101, 201 … the only
       * reachable values — and 50% is not among them. Every drag produced 50.01%, and
       * the field faithfully printed it. With min=0 the stops are the whole percents,
       * which is what the thumb is for; `clampWeight` lifts a dragged 0 back to the
       * floor, so the far left means "as little as this can hold" rather than "gone".
       * Anything finer than a percent is typed into the field beside it.
       */}
      <input
        type="range"
        className="stack-slider min-w-0 flex-1"
        style={{ "--thumb": accent } as React.CSSProperties}
        min={0}
        max={TOTAL_BPS}
        step={100}
        value={allocation.weightBps}
        disabled={locked}
        aria-label={`${name} share of your Stack`}
        aria-valuetext={`${formatPct(allocation.weightBps)} percent`}
        onPointerDown={onBegin}
        onPointerUp={onEnd}
        onKeyDown={onBegin}
        onKeyUp={onEnd}
        onBlur={onEnd}
        onChange={(e) => onSet(clampWeight(Number(e.target.value), count))}
      />

      <span className="relative shrink-0">
        <input
          type="text"
          inputMode="decimal"
          className={`field num w-[76px] py-1.5 pr-6 text-right text-[13px] ${
            invalid ? "border-down" : ""
          }`}
          value={shown}
          disabled={locked}
          aria-label={`${name} percentage`}
          aria-invalid={invalid || undefined}
          onFocus={() => { setInvalid(false); onBegin(); }}
          onChange={(e) => {
            setInvalid(false);
            setText(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setText(null);
              setInvalid(false);
            }
          }}
        />
        <span
          aria-hidden
          className="num pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-faint"
        >
          %
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-faint transition-colors hover:border-down hover:text-down"
      >
        <span className="sr-only">
          Take {name} out of your Stack
        </span>
        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
          <path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

/** The percentage an accessible summary reads out, without the ring. */
export function holdingsSentence(
  allocations: readonly Allocation[],
  names: Record<string, string>
): string {
  if (allocations.length === 0) return "Your Stack is empty.";
  const parts = allocations.map(
    (a) => `${names[a.assetId] ?? a.assetId} ${toPct(a.weightBps)} percent`
  );
  return `${allocations.length} ${allocations.length === 1 ? "stock" : "stocks"}: ${parts.join(", ")}.`;
}
