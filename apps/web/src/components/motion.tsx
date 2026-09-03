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
 * A cold light that follows the cursor across a surface. Applied to the hero only:
 * it is the difference between a flat dark rectangle and a lit one.
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
