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

const CARD_H = "min-h-[140px] h-[152px] sm:h-[160px]";

function GameCardContent({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full min-h-0 flex-col items-center justify-center",
        "gap-2.5 px-6 py-5 text-center sm:gap-3 sm:px-6 sm:py-6"
      )}
    >
      <span
        className="text-[40px] leading-none select-none sm:text-[48px]"
        aria-hidden
      >
        {emoji}
      </span>
      <h2 className="text-[1.125rem] font-bold uppercase tracking-[0.06em] text-white/[0.98] sm:text-[1.2rem]">
        {title}
      </h2>
      <p className="max-w-[19rem] text-[0.8125rem] font-normal leading-snug text-white/44 sm:text-[0.875rem]">
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
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(201,162,39,0.07),transparent_50%),radial-gradient(ellipse_70%_45%_at_100%_100%,rgba(58,92,72,0.1),transparent_42%)]"
          aria-hidden
        />

        <div className="relative z-[1] mx-auto w-full px-4 pt-5 sm:px-6 sm:pt-7">
          <h1 className="text-center text-[1.35rem] font-semibold tracking-[0.02em] text-white/95 sm:text-2xl">
            Игры
          </h1>

          <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-[18px] sm:mt-7">
            <Link
              href="/durak"
              className={cn(
                "relative block w-full shrink-0 outline-none",
                CARD_H,
                "rounded-[24px] bg-[#151515]",
                "ring-1 ring-inset ring-[#c9a227]/[0.14]",
                "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5),0_0_40px_-12px_rgba(212,168,75,0.18)]",
                "transition-[transform,box-shadow] duration-200",
                "hover:shadow-[0_6px_28px_-4px_rgba(0,0,0,0.55),0_0_48px_-10px_rgba(232,190,100,0.24)]",
                "focus-visible:ring-2 focus-visible:ring-[#d4a84b]/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060504]",
                "active:scale-[0.99]"
              )}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,rgba(232,200,122,0.11),transparent_58%)]"
                aria-hidden
              />
              <div className="relative z-[1] flex h-full w-full">
                <GameCardContent
                  emoji="🎴"
                  title="Дурак"
                  subtitle="Онлайн за столом"
                />
              </div>
            </Link>

            <div className="relative w-full shrink-0" aria-disabled>
              <div
                className={cn(
                  "relative flex w-full flex-col overflow-hidden rounded-[24px] bg-[#111111]",
                  CARD_H,
                  "ring-1 ring-inset ring-white/[0.06]",
                  "shadow-[0_4px_20px_-6px_rgba(0,0,0,0.55)]",
                  "opacity-[0.7]",
                  "pointer-events-none select-none"
                )}
              >
                <div
                  className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(ellipse_78%_68%_at_50%_0%,rgba(180,150,90,0.06),transparent_60%)]"
                  aria-hidden
                />
                <div className="relative z-[1] flex h-full w-full">
                  <GameCardContent
                    emoji="♠️"
                    title="Покер"
                    subtitle="Скоро в Gastrobar"
                  />
                </div>
              </div>
              <span
                className="pointer-events-none absolute right-4 top-4 z-10 rounded-md border border-[#c9a227]/30 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#e8d5a8] backdrop-blur-[8px] sm:right-5 sm:top-5 sm:px-2.5 sm:text-[11px]"
                aria-label="Скоро"
              >
                Скоро
              </span>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
