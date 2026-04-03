import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";

export const metadata: Metadata = {
  title: "Игры — GASTROBAR",
  description: "Выбор игры в GASTROBAR.",
};

export default function GamesPage() {
  return (
    <>
      <Header />
      <main
        className={`mx-auto min-h-[100dvh] w-full max-w-xl bg-[#14100c] px-4 pb-[max(6rem,calc(env(safe-area-inset-bottom,0px)+5.5rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
      >
        <div className="mx-auto w-full max-w-md pt-2">
          <h1 className="text-2xl font-semibold text-white">Игры</h1>
          <p className="mt-1 text-sm text-white/55">Выберите игру</p>
          <ul className="mt-8 space-y-3">
            <li>
              <Link
                href="/durak"
                className="flex flex-col gap-0.5 rounded-2xl border border-white/12 bg-white/[0.06] px-5 py-4 transition hover:border-[#f8d66d]/45 hover:bg-white/[0.09] active:scale-[0.99]"
              >
                <span className="text-lg font-semibold text-white">Подкидной дурак</span>
                <span className="text-sm text-white/50">Играть онлайн за столом</span>
              </Link>
            </li>
          </ul>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
