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

const TILE_H = "h-[min(52vw,17.5rem)] sm:h-[min(42vw,19rem)] md:h-[20rem]";

function TileChrome({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset",
        active
          ? "ring-[#c9a227]/25 shadow-[0_0_0_1px_rgba(201,162,39,0.12),0_22px_56px_-8px_rgba(201,120,40,0.22),0_10px_40px_rgba(0,0,0,0.55)]"
          : "ring-white/[0.06] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)]"
      )}
      aria-hidden
    />
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

          <div className="mx-auto mt-8 flex max-w-md flex-col gap-4 sm:mt-10 sm:gap-5">
            {/* Дурак — активная */}
            <Link
              href="/durak"
              className={cn(
                "group relative block w-full overflow-hidden rounded-[22px] outline-none transition",
                TILE_H,
                "focus-visible:ring-2 focus-visible:ring-[#d4a84b]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060504]",
                "active:scale-[0.985] sm:active:scale-[0.992]"
              )}
            >
              <Image
                src="/durak.png"
                alt="Дурак"
                fill
                priority
                sizes="(max-width: 640px) 100vw, 448px"
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/35 to-black/45"
                aria-hidden
              />
              <div
                className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/92 via-black/55 to-transparent"
                aria-hidden
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_120%,rgba(212,168,75,0.14),transparent_58%)] opacity-80 mix-blend-screen" aria-hidden />
              <TileChrome active />

              <div className="relative flex h-full flex-col justify-end p-5 pb-5 sm:p-6 sm:pb-6">
                <h2 className="font-semibold tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] sm:text-[1.35rem]">
                  Дурак
                </h2>
                <div
                  className="mt-2.5 h-px w-14 max-w-[40%] bg-gradient-to-r from-[#e8c87a] via-[#c9a227] to-transparent sm:w-16"
                  aria-hidden
                />
              </div>
            </Link>

            {/* Покер — скоро */}
            <div
              className={cn("relative w-full overflow-hidden rounded-[22px]", TILE_H)}
              aria-disabled
            >
              <Image
                src="/poker.png"
                alt="Покер"
                fill
                sizes="(max-width: 640px) 100vw, 448px"
                className="object-cover scale-[1.02] blur-[1.5px] brightness-75 contrast-[0.92]"
              />
              <div className="absolute inset-0 bg-[#050403]/65" aria-hidden />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/50 to-black/55"
                aria-hidden
              />
              <div
                className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/95 via-black/65 to-transparent"
                aria-hidden
              />
              <TileChrome active={false} />

              <span
                className="absolute right-4 top-4 z-[2] rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8d5a8]/90 backdrop-blur-md sm:right-5 sm:top-5 sm:px-3 sm:text-[11px]"
                aria-label="Скоро"
              >
                Скоро
              </span>

              <div className="relative flex h-full flex-col justify-end p-5 pb-5 sm:p-6 sm:pb-6">
                <h2 className="font-semibold tracking-wide text-white/78 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-[1.35rem]">
                  Покер
                </h2>
                <div
                  className="mt-2.5 h-px w-14 max-w-[40%] bg-gradient-to-r from-[#9a7d3c]/90 via-[#6b5a30]/80 to-transparent sm:w-16"
                  aria-hidden
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
