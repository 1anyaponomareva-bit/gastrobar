"use client";

import { useLayoutEffect, useState } from "react";

/** Measured height of `.poster-test-top-bar` (flags + profile). */
export function usePosterTestTopBarOffset(): number {
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const bar = document.querySelector(".poster-test-top-bar");
    if (!bar) return;

    const sync = () => {
      setOffset(Math.ceil(bar.getBoundingClientRect().height));
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return offset;
}
