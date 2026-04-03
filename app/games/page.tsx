import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Игры за столом — GASTROBAR",
  description: "Играй онлайн с друзьями или гостями GASTROBAR. Подкидной дурак и скоро — покер.",
  openGraph: {
    title: "Игры за столом — GASTROBAR",
    description: "Играй онлайн с друзьями или гостями Gastrobar.",
  },
};

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

/** Декоративный слой: рубашки / масти, без внешних ассетов */
function CardTableBackdrop({ variant }: { variant: "hero" | "muted" }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]",
        variant === "muted" && "opacity-50"
      )}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-0",
          variant === "hero"
            ? "bg-gradient-to-br from-[#1a2e24] via-[#141a16] to-[#1f1608]"
            : "bg-gradient-to-br from-[#141820] via-[#12141a] to-[#18120c]"
        )}
      />
      <div className="absolute -right-[20%] -top-[30%] h-[min(140%,28rem)] w-[min(90%,20rem)] rounded-[2.5rem] border-2 border-white/[0.07] bg-[#0f1310] shadow-[0_0_60px_rgba(0,0,0,0.45)] rotate-[8deg]" />
      <div className="absolute -left-[15%] top-[20%] h-[min(120%,22rem)] w-[min(75%,16rem)] rounded-[2rem] border-2 border-amber-900/30 bg-gradient-to-br from-[#1c2820] to-[#0d1210] rotate-[-11deg] opacity-80" />
      <div className="absolute left-[12%] top-[18%] text-[4.5rem] leading-none text-white/[0.06] sm:text-[5.5rem]">♠</div>
      <div className="absolute right-[18%] top-[42%] text-[3.25rem] leading-none text-red-500/[0.07] sm:text-6xl">♥</div>
      <div className="absolute bottom-[22%] right-[10%] text-[3.5rem] leading-none text-white/[0.05]">♣</div>
      <div className="absolute bottom-[28%] left-[20%] text-[2.75rem] leading-none text-red-500/[0.06]">♦</div>
      <div
        className={cn(
          "absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_110%,rgba(248,214,109,0.12),transparent_55%)]",
          variant === "muted" && "opacity-60"
        )}
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
          "relative mx-auto min-h-[100dvh] w-full max-w-2xl overflow-x-hidden pb-[max(7rem,calc(env(safe-area-inset-bottom,0px)+6rem))] text-[#f5f0e8]",
          HEADER_OFFSET_TOP,
          "bg-[#0a0908]"
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_55%_at_50%_-15%,rgba(248,214,109,0.09),transparent_50%),radial-gradient(ellipse_80%_40%_at_100%_80%,rgba(34,84,61,0.18),transparent_45%)]"
          aria-hidden
        />

        <div className="relative z-[1] mx-auto w-full max-w-lg px-5 pt-8 sm:px-6 sm:pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f8d66d]/85">Gastrobar</p>
          <h1 className="mt-3 text-[1.85rem] font-semibold leading-[1.12] tracking-tight text-white sm:text-4xl sm:leading-[1.1]">
            Игры за столом
          </h1>
          <p className="mt-4 max-w-[26rem] text-base leading-relaxed text-[#c4b8a8] sm:text-[1.05rem]">
            Играй онлайн с друзьями или гостями Gastrobar
          </p>

          <div className="mt-10 space-y-5 sm:mt-12 sm:space-y-6">
            {/* Hero: Подкидной дурак */}
            <article className="group relative overflow-hidden rounded-3xl border border-[#f8d66d]/25 bg-[#12100e] shadow-[0_28px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]">
              <CardTableBackdrop variant="hero" />
              <div className="relative z-[1] flex flex-col px-6 pb-7 pt-8 sm:px-8 sm:pb-8 sm:pt-9">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">Подкидной дурак</h2>
                    <p className="text-[15px] text-[#c9bdad] sm:text-base">Онлайн-игра за столом</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#f8d66d]/45 bg-[#f8d66d]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#f8d66d]">
                    Доступно
                  </span>
                </div>

                <div className="relative mx-auto my-8 flex h-[5.5rem] w-full max-w-[12rem] items-center justify-center sm:my-9">
                  <div className="absolute h-[4.25rem] w-14 rounded-lg border border-white/15 bg-gradient-to-br from-[#1e2420] to-[#0f1210] shadow-lg rotate-[-14deg] ring-1 ring-[#f8d66d]/15" />
                  <div className="absolute h-[4.25rem] w-14 rounded-lg border border-white/20 bg-gradient-to-br from-[#252c26] to-[#121614] shadow-xl rotate-[-4deg] z-[1]" />
                  <div className="absolute h-[4.25rem] w-14 rounded-lg border border-[#f8d66d]/35 bg-gradient-to-br from-[#2a3229] to-[#151a17] shadow-2xl rotate-[8deg] z-[2]" />
                </div>

                <Link
                  href="/durak"
                  className="relative z-[1] flex w-full items-center justify-center rounded-2xl bg-[#f8d66d] py-4 text-base font-semibold text-[#1a1612] shadow-[0_12px_40px_rgba(248,214,109,0.28)] transition hover:brightness-[1.05] active:scale-[0.99] active:brightness-100"
                >
                  Играть
                </Link>
              </div>
            </article>

            {/* Скоро: Покер */}
            <article
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0e0c0b]/90 shadow-[0_20px_56px_rgba(0,0,0,0.4)]"
              aria-disabled
            >
              <CardTableBackdrop variant="muted" />
              <div className="relative z-[1] flex flex-col px-6 py-7 sm:px-8 sm:py-8">
                <div className="absolute inset-0 z-[2] rounded-[inherit] bg-[#0a0908]/55 backdrop-blur-[1px]" aria-hidden />
                <div className="relative z-[3] flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/35">
                      <LockIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h2 className="text-xl font-semibold tracking-tight text-white/75 sm:text-[1.35rem]">Покер</h2>
                      <p className="text-[14px] text-[#9a8f82] sm:text-[15px]">Скоро в Gastrobar</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Скоро
                  </span>
                </div>
                <p className="relative z-[3] mt-5 text-[13px] leading-relaxed text-[#6b635a] sm:text-sm">
                  Здесь позже появится второй стол — следите за обновлениями.
                </p>
              </div>
            </article>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
