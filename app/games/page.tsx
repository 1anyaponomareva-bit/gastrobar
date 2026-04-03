import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { GamesSelectionScreen } from "@/components/games/GamesSelectionScreen";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Игры — GASTROBAR",
  description: "Дурак онлайн и скоро — покер.",
  openGraph: {
    title: "Игры — GASTROBAR",
    description: "Выбор игры за столом.",
  },
};

export default function GamesPage() {
  return (
    <>
      <Header />
      <main
        className={cn(
          "relative mx-auto min-h-[100dvh] w-full max-w-lg overflow-x-hidden",
          "pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+6rem))]",
          "text-[#f5f0e8]",
          HEADER_OFFSET_TOP,
          "bg-[#030201]"
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_55%_at_50%_-8%,rgba(217,119,6,0.14),transparent_52%),radial-gradient(ellipse_65%_50%_at_100%_105%,rgba(5,150,105,0.11),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_80%,rgba(251,191,36,0.06),transparent_40%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
            mixBlendMode: "overlay",
          }}
          aria-hidden
        />
        <GamesSelectionScreen />
      </main>
      <BottomNav />
    </>
  );
}
