"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dragging a stock into the chamber, with no library.
 *
 * Pointer events rather than HTML5 drag-and-drop, for two reasons that both matter:
 * native drag does not exist on touch at all, and it gives no control over the thing
 * that follows the cursor — you get the browser's washed-out snapshot instead of the
 * tilted card the design asks for. Pointer events are one code path for mouse, touch and
 * pen, and the overlay is an element we own.
 *
 * **Drag is never the only way in.** Every row is a button, every row can be reached by
 * Tab and activated with Enter, and the chamber's `+` sends focus to the search field.
 * This hook is an enhancement layered on top of a flow that already works without it,
 * which is also why cancelling is free: nothing is mutated until the drop commits, so
 * Escape, a stray release or a browser-cancelled gesture all have nothing to undo.
 */

export interface DragState {
  /** The asset being carried, or null when nothing is in the air. */
  assetId: string | null;
  /** Viewport coordinates for the overlay. */
  x: number;
  y: number;
  /** True while the pointer is over the drop ring and the drop would be accepted. */
  over: boolean;
}

const IDLE: DragState = { assetId: null, x: 0, y: 0, over: false };

/** Movement before a press becomes a drag, so a tap is still a tap. */
const THRESHOLD = 6;

export function useDragToRing({
  onDrop,
  enabled = true,
}: {
  onDrop: (assetId: string) => void;
  enabled?: boolean;
}) {
  const [state, setState] = useState<DragState>(IDLE);
  const target = useRef<HTMLElement | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Everything the gesture needs, off React. A drag emits a pointermove per frame and
  // routing that through state would re-render the whole builder sixty times a second
  // to move one overlay.
  const gesture = useRef<{
    id: number;
    assetId: string;
    node: HTMLElement;
    x0: number;
    y0: number;
    active: boolean;
    done: boolean;
  } | null>(null);

  /** Register the drop ring. The chamber calls this with its own element. */
  const setDropTarget = useCallback((node: HTMLElement | null) => {
    target.current = node;
  }, []);

  /**
   * Is the pointer over the ring?
   *
   * A distance check against the ring's own centre, not `elementFromPoint`. Under
   * pointer capture the event target is always the captured row no matter where the
   * pointer is, and `elementFromPoint` would find the drag overlay — so both of the
   * obvious approaches report the wrong element. The ring is a circle and we know
   * exactly where it is, so measuring is simpler and cannot be fooled.
   */
  const isOver = useCallback((x: number, y: number) => {
    const node = target.current;
    if (!node) return false;
    const r = node.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.hypot(x - cx, y - cy) <= Math.max(r.width, r.height) / 2;
  }, []);

  /**
   * End the gesture. Idempotent, and called from every exit there is: release, cancel,
   * Escape, the window losing focus, the tab being hidden, and unmount. Miss one and the
   * overlay is orphaned on the page with no way to dismiss it.
   */
  const end = useCallback(
    (commit: boolean) => {
      const g = gesture.current;
      if (!g || g.done) return;
      g.done = true;
      gesture.current = null;

      try {
        g.node.releasePointerCapture(g.id);
      } catch {
        // Throws when the pointer is already gone — which is most of the time on a
        // cancel, and is not a problem.
      }
      g.node.removeAttribute("data-dragging");
      document.body.style.removeProperty("user-select");

      const dropped = commit && g.active && isOver(lastPoint.current.x, lastPoint.current.y);
      setState(IDLE);
      if (dropped) onDropRef.current(g.assetId);
    },
    [isOver]
  );

  const lastPoint = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (event: React.PointerEvent, assetId: string) => {
      if (!enabled || event.button !== 0) return;
      const node = event.currentTarget as HTMLElement;
      gesture.current = {
        id: event.pointerId,
        assetId,
        node,
        x0: event.clientX,
        y0: event.clientY,
        active: false,
        done: false,
      };
      lastPoint.current = { x: event.clientX, y: event.clientY };
      // Deliberately no capture and no preventDefault yet: until the threshold is
      // crossed this is still a click, and claiming the pointer now would break it.
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    const move = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.id) return;
      lastPoint.current = { x: event.clientX, y: event.clientY };

      if (!g.active) {
        if (Math.hypot(event.clientX - g.x0, event.clientY - g.y0) < THRESHOLD) return;
        g.active = true;
        try {
          g.node.setPointerCapture(g.id);
        } catch {
          // Without capture the drag still works while the pointer stays over the row;
          // it is a downgrade, not a failure, and not worth abandoning the gesture for.
        }
        g.node.setAttribute("data-dragging", "true");
        // Stops the mouse drag from selecting every label it passes over.
        document.body.style.setProperty("user-select", "none");
      }

      event.preventDefault();
      setState({
        assetId: g.assetId,
        x: event.clientX,
        y: event.clientY,
        over: isOver(event.clientX, event.clientY),
      });
    };

    const up = (event: PointerEvent) => {
      if (gesture.current && event.pointerId !== gesture.current.id) return;
      end(true);
    };
    const cancel = () => end(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") end(false);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") end(false);
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
      end(false);
    };
  }, [enabled, end, isOver]);

  return { state, onPointerDown, setDropTarget };
}
