"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { POSTER_TEST_BANNER_HEIGHT_PX } from "@/lib/posterTestRoutes";

function PosterTestFoodFrameInner() {
  const searchParams = useSearchParams();
  const section = searchParams?.get("section");
  const iframeSrc = section ? `/food/?section=${encodeURIComponent(section)}` : "/food/";

  return (
    <iframe
      src={iframeSrc}
      title="Gastrofood menu (test)"
      className="h-full w-full border-0 bg-[#12121a]"
    />
  );
}

export function PosterTestFoodFrame() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-0"
      style={{
        top: `calc(${POSTER_TEST_BANNER_HEIGHT_PX}px + env(safe-area-inset-top, 0px))`,
      }}
    >
      <Suspense
        fallback={<div className="flex h-full items-center justify-center text-sm text-white/60">Loading…</div>}
      >
        <PosterTestFoodFrameInner />
      </Suspense>
    </div>
  );
}
