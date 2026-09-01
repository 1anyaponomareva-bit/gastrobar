import type { Metadata } from "next";
import { Suspense } from "react";
import { PosterTestAuthProvider } from "@/components/poster-test/PosterTestAuthProvider";
import { PosterTestCartProvider } from "@/components/poster-test/PosterTestCartProvider";
import { PosterTestLuckyWheelWidget } from "@/components/poster-test/PosterTestLuckyWheelWidget";
import { PosterTestTopBar } from "@/components/poster-test/PosterTestTopBar";
import { PosterTestWheelScopeProvider } from "@/components/poster-test/PosterTestWheelScopeContext";
import "./poster-test-layout.css";

export const metadata: Metadata = {
  title: "GASTROBAR — Poster test",
  description: "Тестовая копия меню для интеграции с Poster.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PosterTestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="poster-test-shell min-h-[100dvh] bg-black">
      <PosterTestAuthProvider>
        <PosterTestWheelScopeProvider>
          <PosterTestTopBar />
          <Suspense fallback={null}>
            <PosterTestCartProvider>{children}</PosterTestCartProvider>
          </Suspense>
          <Suspense fallback={null}>
            <PosterTestLuckyWheelWidget />
          </Suspense>
        </PosterTestWheelScopeProvider>
      </PosterTestAuthProvider>
    </div>
  );
}
