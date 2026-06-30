import { POSTER_TEST_BANNER_HEIGHT_PX } from "@/lib/posterTestRoutes";

export function PosterTestBanner() {
  return (
    <div
      className="fixed left-0 right-0 top-0 z-[2100] flex items-center justify-center border-b border-amber-400/35 bg-amber-500/95 px-3 text-center shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
      style={{
        height: POSTER_TEST_BANNER_HEIGHT_PX,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      role="status"
      aria-live="polite"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-black sm:text-[11px]">
        TEST VERSION
      </span>
    </div>
  );
}
