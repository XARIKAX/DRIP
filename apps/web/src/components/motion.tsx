"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Motion, centralised.
 *
 * Two mechanisms cover the whole site. `useInView` flips a class on a container when
 * it enters the frame, and CSS does the rest — reveals are declarative, staggered by
 * `--beat`, and cost nothing per frame. `useScrollProgress` returns a 0→1 number for a
 * pinned section, sampled on rAF, for the one place where the animation *is* the scroll.
 *
 * Reduced motion is handled once, here: hooks resolve immediately to their finished
 * state and the CSS layer drops every transition.
 */

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True once the element has been seen. Never flips back — nothing un-reveals. */
export function useInView<T extends HTMLElement>(options?: { threshold?: number; rootMargin?: string }) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReduced() || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setSeen(true);
            observer.disconnect();
          }
        }
      },
      { threshold: options?.threshold ?? 0.15, rootMargin: options?.rootMargin ?? "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return { ref, seen } as const;
}

/**
 * Wraps children in a container that gains `.in-view` when scrolled to, which is what
 * every `.reveal`, `.mask-line` and `.rule-draw` inside it is waiting for.
 */
export function Reveal({
  children,
  className = "",
  threshold,
  style,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
  style?: CSSProperties;
}) {
  const { ref, seen } = useInView<HTMLDivElement>({ threshold });
  return (
    <div ref={ref} className={`${seen ? "in-view" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

/** A single line of display type, wiped up behind its own mask. */
export function MaskLine({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`mask-line ${className}`}>
      <span>{children}</span>
    </span>
  );
}

/**
 * Scroll progress through a tall element, 0 when its top hits the viewport top and 1
 * when its bottom clears the viewport bottom. Sampled on rAF and only while the element
 * is on screen, so an off-screen section costs nothing.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReduced()) {
      setProgress(1);
      return;
    }

    let frame = 0;
    let running = true;
    let last = -1;

    const sample = () => {
      if (!running) return;
      const rect = node.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const raw = travel > 0 ? -rect.top / travel : rect.top <= 0 ? 1 : 0;
      const clamped = Math.min(Math.max(raw, 0), 1);
      // Only re-render on a visible change: 1/500th of the track.
      if (Math.abs(clamped - last) > 0.002) {
        last = clamped;
        setProgress(clamped);
      }
      frame = requestAnimationFrame(sample);
    };

    // Park the rAF loop entirely while the section is out of frame.
    const gate = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !frame) {
          running = true;
          frame = requestAnimationFrame(sample);
        } else if (!entry.isIntersecting && frame) {
          running = false;
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { threshold: 0 }
    );

    gate.observe(node);
    return () => {
      running = false;
      gate.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, progress } as const;
}

/** Maps a value from one range to another and clamps it. The workhorse of scroll scenes. */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  const t = Math.min(Math.max((value - inMin) / (inMax - inMin), 0), 1);
  return outMin + (outMax - outMin) * t;
}

/** Ease out cubic. The house curve, in JS, for scroll-linked values. */
export function ease(t: number): number {
  return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
}

/**
 * A cold light that follows the cursor across a surface, published as --px/--py for
 * the `.spotlight` pseudo element to consume. Pointer work is rAF-coalesced and only
 * ever writes custom properties, so it never triggers layout.
 */
export function usePointerGlow<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReduced()) return;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        node.style.setProperty("--px", `${((e.clientX - rect.left) / rect.width) * 100}%`);
        node.style.setProperty("--py", `${((e.clientY - rect.top) / rect.height) * 100}%`);
      });
    };

    node.addEventListener("pointermove", onMove);
    return () => {
      node.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}

/**
 * Tilts a surface toward the pointer. Small angles only — past about four degrees a
 * card stops reading as a lit object and starts reading as a novelty.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 3.5) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReduced()) return;
    if (window.matchMedia("(hover: none)").matches) return;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        node.style.setProperty("--ry", `${nx * maxDeg * 2}deg`);
        node.style.setProperty("--rx", `${-ny * maxDeg * 2}deg`);
        node.style.setProperty("--px", `${(nx + 0.5) * 100}%`);
        node.style.setProperty("--py", `${(ny + 0.5) * 100}%`);
      });
    };

    const onLeave = () => {
      node.style.setProperty("--ry", "0deg");
      node.style.setProperty("--rx", "0deg");
    };

    // Tracked on the window so the tilt responds before the cursor arrives.
    window.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [maxDeg]);

  return ref;
}

/**
 * Leans an element toward a nearby cursor. The pull falls off with distance and stops
 * entirely outside `radius`, so a button only reacts when you are actually going for it.
 */
export function useMagnetic<T extends HTMLElement>(strength = 6, radius = 130) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReduced()) return;
    if (window.matchMedia("(hover: none)").matches) return;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = node.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) {
          node.style.setProperty("--mx", "0px");
          node.style.setProperty("--my", "0px");
          return;
        }
        const pull = (1 - distance / radius) * strength;
        node.style.setProperty("--mx", `${(dx / (distance || 1)) * pull}px`);
        node.style.setProperty("--my", `${(dy / (distance || 1)) * pull}px`);
      });
    };

    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [strength, radius]);

  return ref;
}

/**
 * How far down the document the reader is, 0→1. Drives the progress hairline in the
 * chrome — the cheapest way to tell someone how much argument is left.
 */
export function useReadProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const sample = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(Math.max(window.scrollY / scrollable, 0), 1) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sample);
    };
    sample();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

/**
 * A figure that counts up to its value the first time it is seen, then stops.
 *
 * Reserved for the numbers that carry a section. A page where every digit animates is
 * a page where nothing is emphasised, so this is used four or five times, never more.
 */
export function CountUp({
  to,
  decimals = 0,
  duration = 1100,
  className = "",
}: {
  to: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const { ref, seen } = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (prefersReduced()) {
      setValue(to);
      return;
    }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(t) {
      const p = Math.min((t - t0) / duration, 1);
      setValue(to * ease(p));
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [seen, to, duration]);

  return (
    <span ref={ref} className={`num tabular-nums ${className}`}>
      {value.toFixed(decimals)}
    </span>
  );
}

/** The reading progress hairline. Sits under the chrome, above everything else. */
export function ReadProgress() {
  const progress = useReadProgress();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-veil h-[2px]"
      aria-hidden
    >
      <div
        className="h-full origin-left bg-cyan-dark"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

/** How far the window has scrolled, in pixels. Used by the nav to condense on scroll. */
export function useScrollY(threshold = 24): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setPast(window.scrollY > threshold);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return past;
}
