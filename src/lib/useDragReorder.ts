"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const AUTO_SCROLL_EDGE = 90;

type DragReorderOptions = {
  /** Distance from the bottom where auto-scroll starts; larger when a sticky bar covers the screen. */
  bottomEdge?: number;
  onEnd?: () => void;
};

/** Reorders a list by dragging a handle with a finger or mouse; scrolls the page near the screen edges. */
export function useDragReorder(
  onMove: (from: number, to: number) => void,
  { bottomEdge = AUTO_SCROLL_EDGE, onEnd }: DragReorderOptions = {},
) {
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const drag = useRef<{ index: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const renderedIndex = useRef<number | null>(null);
  renderedIndex.current = dragIndex;

  const retarget = () => {
    const current = drag.current;
    // Row positions are stale until the previous move has been rendered.
    if (!current || renderedIndex.current !== current.index) return;
    let target = 0;
    rowRefs.current.forEach((row, index) => {
      if (!row || index === current.index) return;
      const rect = row.getBoundingClientRect();
      if (current.y > rect.top + rect.height / 2) target += 1;
    });
    if (target !== current.index) {
      onMoveRef.current(current.index, target);
      current.index = target;
      setDragIndex(target);
    }
  };

  const tick = () => {
    const current = drag.current;
    if (!current) return;
    if (current.y < AUTO_SCROLL_EDGE) window.scrollBy(0, -10);
    else if (current.y > window.innerHeight - bottomEdge) window.scrollBy(0, 10);
    retarget();
    frame.current = requestAnimationFrame(tick);
  };

  const halt = () => {
    drag.current = null;
    setDragIndex(null);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const stop = () => {
    const wasDragging = drag.current !== null;
    halt();
    if (wasDragging) onEndRef.current?.();
  };

  useEffect(() => halt, []);

  const handleProps = (index: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is optional; moves still reach the handle without it.
      }
      drag.current = { index, y: event.clientY };
      renderedIndex.current = index;
      setDragIndex(index);
      frame.current = requestAnimationFrame(tick);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      drag.current.y = event.clientY;
      retarget();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
  });

  return { rowRefs, dragIndex, handleProps };
}
