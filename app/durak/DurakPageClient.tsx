"use client";

import { DurakGame } from "@/components/durak/DurakGame";

/** Только в браузере: исключает гидратацию тяжёлого дерева игры и расхождение SSR/CSR (чёрный экран). */
export default function DurakPageClient() {
  return (
    <div className="relative mx-auto flex min-h-[calc(100svh-6.5rem)] w-full max-w-lg flex-1 flex-col">
      <DurakGame />
    </div>
  );
}
