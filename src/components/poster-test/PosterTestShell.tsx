"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PosterTestAuthProvider } from "@/components/poster-test/PosterTestAuthProvider";
import { PosterTestCartProvider } from "@/components/poster-test/PosterTestCartProvider";
import { PosterTestLuckyWheelWidget } from "@/components/poster-test/PosterTestLuckyWheelWidget";
import { PosterTestTopBar } from "@/components/poster-test/PosterTestTopBar";
import { PosterTestWheelScopeProvider } from "@/components/poster-test/PosterTestWheelScopeContext";
import { isPosterTestMerchantPath } from "@/lib/posterTestRoutes";

export function PosterTestShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMerchant = isPosterTestMerchantPath(pathname ?? "");

  return (
    <div className={`poster-test-shell min-h-[100dvh] bg-black ${isMerchant ? "poster-test-shell--merchant" : ""}`}>
      <PosterTestAuthProvider>
        {isMerchant ? (
          children
        ) : (
          <PosterTestWheelScopeProvider>
            <PosterTestTopBar />
            <Suspense fallback={null}>
              <PosterTestCartProvider>{children}</PosterTestCartProvider>
            </Suspense>
            <Suspense fallback={null}>
              <PosterTestLuckyWheelWidget />
            </Suspense>
          </PosterTestWheelScopeProvider>
        )}
      </PosterTestAuthProvider>
    </div>
  );
}
