"use client";

import dynamic from "next/dynamic";

const DurakPageClient = dynamic(() => import("./DurakPageClient"), {
  ssr: false,
  loading: () => (
    <div
      className="mx-auto flex min-h-[min(100dvh,720px)] w-full max-w-lg flex-1 flex-col items-center justify-center bg-[#14100c] px-4 text-center text-sm text-emerald-100/70"
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
