import { POSTER_TEST_BANNER_HEIGHT_PX } from "@/lib/posterTestRoutes";
import { PosterTestProfileButton } from "@/components/poster-test/PosterTestProfileButton";

export function PosterTestBanner() {
  return (
    <div
      className="poster-test-banner fixed left-0 right-0 top-0 z-[2100] border-b border-amber-400/35 bg-amber-500/95 shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
      style={{
        height: POSTER_TEST_BANNER_HEIGHT_PX,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="poster-test-banner__inner">
        <span className="poster-test-banner__label">TEST VERSION</span>
        <PosterTestProfileButton />
      </div>
    </div>
  );
}
