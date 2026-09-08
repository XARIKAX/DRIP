"use client";

import { useEffect, useRef } from "react";
import { mulberry32 } from "@/lib/rand";

/**
 * Falling petals. The one canvas in the product.
 *
 * Everything else in the garden is SVG, because SVG renders on the server and costs
 * nothing per frame. Petals are the exception that proves the rule: dozens of things
 * moving independently is what a raster is for, and an empty canvas before hydration
 * costs nothing because it is ambience, never content.
 *
 * The trick that keeps it both cheap and honest to the pixel grid: the backing store is
 * sized in CELLS, not pixels, and CSS stretches it with `image-rendering: pixelated`. A
 * 1440x900 hero gets a 240x150 buffer, every petal is a one- or two-cell `fillRect` at
 * an integer coordinate, and the whole frame fills a couple of hundred pixels. It is
 * also, structurally, incapable of drawing a half pixel or caring about device pixel
 * ratio.
 *
 * Three guards, all mandatory:
 *   - off screen cancels the loop rather than skipping the draw, because a parked
 *     `requestAnimationFrame` still costs a wake-up sixty times a second;
 *   - a hidden tab does the same;
 *   - reduced motion draws one frame of petals already SETTLED along the floor and
 *     never starts. The ambience survives; the motion does not. CSS cannot do this
 *     part — `animation: none` has no opinion about an animation frame loop.
 */

interface Petal {
  x: number;
  y: number;
  vy: number;
  phase: number;
  wide: boolean;
  tone: number;
}

/** Sway offsets, as a rational table. Trigonometry is not portable; a table is. */
const SWAY = [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1, -1, 0];

export function PetalField({
  /** Petals per 100k CSS pixels of area. */
  density = 2.2,
  /** Cells across at the widest. The buffer is sized from this. */
  cell = 6,
  seed = 17,
  className = "",
}: {
  density?: number;
  cell?: number;
  seed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let running = false;
    let petals: Petal[] = [];
    let cols = 0;
    let rows = 0;
    let tones: string[] = [];

    const readTones = () => {
      const cs = getComputedStyle(canvas);
      tones = ["--pk-bloom-1", "--pk-bloom-2", "--pk-bloom-3"].map(
        (v) => cs.getPropertyValue(v).trim() || "#ffbbd3"
      );
    };

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      cols = Math.max(8, Math.round(rect.width / cell));
      rows = Math.max(8, Math.round(rect.height / cell));
      canvas.width = cols;
      canvas.height = rows;
      ctx.imageSmoothingEnabled = false;

      const area = rect.width * rect.height;
      const count = Math.min(72, Math.max(6, Math.round((area / 100_000) * density)));
      const rnd = mulberry32(seed);
      petals = Array.from({ length: count }, () => ({
        x: Math.floor(rnd() * cols),
        y: Math.floor(rnd() * rows),
        vy: 0.06 + rnd() * 0.14,
        phase: Math.floor(rnd() * SWAY.length),
        wide: rnd() > 0.55,
        tone: Math.floor(rnd() * 3),
      }));
      return true;
    };

    const paint = () => {
      ctx.clearRect(0, 0, cols, rows);
      for (const p of petals) {
        ctx.fillStyle = tones[p.tone] ?? "#ffbbd3";
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.wide ? 2 : 1, 1);
      }
    };

    const step = () => {
      if (!running) return;
      for (const p of petals) {
        p.y += p.vy;
        p.phase = (p.phase + 1) % (SWAY.length * 6);
        p.x += SWAY[Math.floor(p.phase / 6)]! * 0.16;
        if (p.y >= rows) {
          p.y = -1;
          p.x = Math.floor(p.x * 7 + 13) % cols;
        }
        if (p.x < -2) p.x = cols + 1;
        if (p.x > cols + 2) p.x = -1;
      }
      paint();
      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      frame = requestAnimationFrame(step);
    };

    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    readTones();
    if (!layout()) return;

    if (reduced) {
      // One frame, petals already fallen. Present, not moving.
      for (const p of petals) p.y = rows - 1 - (p.tone % 3);
      paint();
      return;
    }

    // Two-way: `useInView` latches true and never lets go, which is right for a reveal
    // and wrong for a loop that must actually stop when it leaves the screen.
    const seen = new IntersectionObserver(
      ([entry]) => (entry?.isIntersecting ? start() : stop()),
      { threshold: 0 }
    );
    seen.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        readTones();
        layout();
      }, 180);
    };
    window.addEventListener("resize", onResize);

    return () => {
      stop();
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
    };
  }, [density, cell, seed]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pixel pointer-events-none h-full w-full ${className}`}
    />
  );
}
