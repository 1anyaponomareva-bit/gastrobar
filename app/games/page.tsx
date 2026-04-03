import type { Metadata } from "next";
import Image from "next/image";
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

/** Ширина/высота — пропорции для layout; фактический кадр задаёт object-contain. */
const IMG_W = 960;
const IMG_H = 720;

function TileFooter({ title, active }: { title: string; active: boolean }) {
  return (
    <div
      className={cn(
        "border-t px-5 py-4 sm:px-6 sm:py-4",
        active ? "border-white/[0.09] bg-[#0c0a08]/90" : "border-white/[0.06] bg-[#080706]/95"
      )}
    >
      <h2
        className={cn(
          "text-left text-[1.125rem] font-semibold tracking-wide sm:text-[1.2rem]",
          active ? "text-white/95" : "text-white/70"
        )}
      >
        {title}
      </h2>
      <div
        className={cn(
          "mt-2.5 h-px w-16 sm:w-[4.5rem]",
          active
            ? "bg-gradient-to-r from-[#e8c87a] via-[#c9a227] to-transparent"
            : "bg-gradient-to-r from-[#7a6b40]/80 to-transparent"
        )}
        aria-hidden
      />
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

        <div className="relative z-[1] mx-auto w-full px-4 pt-6 sm:px-6 sm:pt-8">
          <h1 className="text-center text-[1.35rem] font-semibold tracking-[0.02em] text-white/95 sm:text-2xl">
            Игры
          </h1>

          <div className="mx-auto mt-8 flex max-w-md flex-col gap-5 sm:mt-10 sm:gap-6">
            {/* Дурак */}
            <Link
              href="/durak"
              className={cn(
                "group flex flex-col overflow-hidden rounded-[22px] outline-none ring-1 ring-inset ring-[#c9a227]/20",
                "bg-[#0a0908] shadow-[0_0_0_1px_rgba(201,162,39,0.08),0_20px_50px_-12px_rgba(0,0,0,0.55),0_0_40px_-20px_rgba(201,120,40,0.18)]",
                "transition focus-visible:ring-2 focus-visible:ring-[#d4a84b]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060504]",
                "active:scale-[0.99] sm:active:scale-[0.995]"
              )}
            >
              <div
                className={cn(
                  "flex w-full items-center justify-center px-4 pb-2 pt-5 sm:px-5 sm:pb-3 sm:pt-6",
                  "min-h-[min(48vw,220px)] sm:min-h-[min(40vw,260px)]"
                )}
              >
                <Image
                  src="/durak.png"
                  alt="Дурак"
                  width={IMG_W}
                  height={IMG_H}
                  priority
                  sizes="(max-width: 640px) 100vw, 448px"
                  className="h-auto w-full max-h-[min(42vh,300px)] object-contain object-center transition duration-300 group-hover:opacity-95 sm:max-h-[min(38vh,320px)]"
                />
              </div>
              <TileFooter title="Дурак" active />
            </Link>

            {/* Покер — скоро */}
            <div
              className={cn(
                "relative flex flex-col overflow-hidden rounded-[22px] ring-1 ring-inset ring-white/[0.08]",
                "bg-[#0a0908] shadow-[0_18px_48px_-14px_rgba(0,0,0,0.65)]",
                "pointer-events-none select-none opacity-[0.92]"
              )}
              aria-disabled
            >
              <span
                className="absolute right-3 top-3 z-10 rounded-full border border-white/12 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8d5a8]/85 backdrop-blur-sm sm:right-4 sm:top-4 sm:px-3 sm:text-[11px]"
                aria-label="Скоро"
              >
                Скоро
              </span>

              <div
                className={cn(
                  "flex w-full items-center justify-center px-4 pb-2 pt-5 sm:px-5 sm:pb-3 sm:pt-6",
                  "min-h-[min(48vw,220px)] sm:min-h-[min(40vw,260px)]",
                  "brightness-[0.82] saturate-[0.92]"
                )}
              >
                <Image
                  src="/poker.png"
                  alt="Покер"
                  width={IMG_W}
                  height={IMG_H}
                  sizes="(max-width: 640px) 100vw, 448px"
                  className="h-auto w-full max-h-[min(42vh,300px)] object-contain object-center sm:max-h-[min(38vh,320px)]"
                />
              </div>
              <TileFooter title="Покер" active={false} />
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
