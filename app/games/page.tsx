import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { GamesSelectionScreen } from "@/components/games/GamesSelectionScreen";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Игры — GASTROBAR",
  description: "Дурак онлайн и скоро — морской бой.",
  openGraph: {
    title: "Игры — GASTROBAR",
    description: "Дурак онлайн и скоро — морской бой.",
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
        <GamesSelectionScreen />
      </main>
      <BottomNav />
    </>
  );
}
