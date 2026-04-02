"use client";

import dynamic from "next/dynamic";

const DurakPageClient = dynamic(() => import("./DurakPageClient"), {
  ssr: false,
  loading: () => (
    <div
      className="mx-auto flex min-h-[calc(100svh-7rem)] w-full max-w-lg flex-col items-center justify-center bg-[#14100c] px-4 pt-[calc(60px+env(safe-area-inset-top,0px))] text-center text-sm text-emerald-100/70"
      aria-live="polite"
    >
      Загрузка игры…
    </div>
  ),
});

/** Обёртка-клиент: `dynamic(..., { ssr: false })` нельзя вызывать из Server Component (Next 15). */
export function DurakShell() {
  return <DurakPageClient />;
}
