import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
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

function GameTileContent({
  emoji,
  title,
  subtitle,
  muted,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-5 py-7 text-center sm:px-6 sm:py-8",
        muted && "opacity-55 grayscale-[0.15]"
      )}
    >
      <span
        className={cn(
          "text-[2.65rem] leading-none sm:text-[2.85rem]",
          "select-none"
        )}
        aria-hidden
      >
        {emoji}
      </span>
      <h2
        className={cn(
          "mt-3 text-[1.2rem] font-semibold tracking-[0.02em] sm:text-[1.25rem]",
          muted ? "text-white/65" : "text-white/[0.96]"
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-1 max-w-[16rem] text-[0.8125rem] font-normal leading-snug sm:text-[0.84rem]",
          muted ? "text-white/45" : "text-[#c9b89a]/90"
        )}
      >
        {subtitle}
      </p>
    </div>
  );
}

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
          "bg-[#060504]"
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(201,162,39,0.07),transparent_50%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(58,92,72,0.12),transparent_42%)]"
          aria-hidden
        />

        <div className="relative z-[1] mx-auto w-full px-4 pt-5 sm:px-6 sm:pt-7">
          <h1 className="text-center text-[1.35rem] font-semibold tracking-[0.02em] text-white/95 sm:text-2xl">
            Игры
          </h1>

          <div className="mx-auto mt-6 flex max-w-md flex-col gap-3.5 sm:mt-7 sm:gap-4">
            <Link
              href="/durak"
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-[26px] outline-none",
                "bg-[linear-gradient(160deg,rgba(22,19,16,0.98)_0%,rgba(8,7,6,0.99)_100%)]",
                "shadow-[0_0_0_1px_rgba(201,162,39,0.07),0_12px_40px_-8px_rgba(0,0,0,0.65),0_0_48px_-12px_rgba(212,145,60,0.22)]",
                "before:pointer-events-none before:absolute before:inset-0 before:rounded-[26px] before:bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(232,200,122,0.14),transparent_62%)]",
                "transition-[transform,box-shadow] duration-200",
                "hover:shadow-[0_0_0_1px_rgba(201,162,39,0.12),0_16px_44px_-8px_rgba(0,0,0,0.7),0_0_56px_-10px_rgba(232,168,75,0.28)]",
                "focus-visible:ring-2 focus-visible:ring-[#d4a84b]/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060504]",
                "active:scale-[0.99] sm:active:scale-[0.995]"
              )}
            >
              <div className="relative z-[1]">
                <GameTileContent
                  emoji="🎴"
                  title="Дурак"
                  subtitle="Онлайн за столом"
                />
              </div>
            </Link>

            <div
              className={cn(
                "relative flex flex-col overflow-hidden rounded-[26px]",
                "bg-[linear-gradient(160deg,rgba(16,14,12,0.96)_0%,rgba(6,5,5,0.98)_100%)]",
                "shadow-[0_10px_32px_-10px_rgba(0,0,0,0.72),0_0_0_1px_rgba(90,78,58,0.12)]",
                "before:pointer-events-none before:absolute before:inset-0 before:rounded-[26px] before:bg-[radial-gradient(ellipse_75%_55%_at_50%_0%,rgba(110,98,80,0.06),transparent_58%)]",
                "pointer-events-none select-none"
              )}
              aria-disabled
            >
              <span
                className="absolute right-3 top-3 z-10 rounded-full bg-[rgba(0,0,0,0.45)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d4bc88]/80 backdrop-blur-[6px] sm:right-3.5 sm:top-3.5 sm:px-2.5 sm:text-[11px]"
                aria-label="Скоро"
              >
                Скоро
              </span>
              <div className="relative z-[1]">
                <GameTileContent
                  emoji="♠️"
                  title="Покер"
                  subtitle="Скоро в Gastrobar"
                  muted
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
