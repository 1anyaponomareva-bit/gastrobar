"use client";

import { DurakGame } from "@/components/durak/DurakGame";

/** Единый flex-поток с `durak-page`: всегда занимаем оставшуюся высоту под шапкой. */
export default function DurakPageClient() {
  return (
    <div className="relative mx-auto flex min-h-[min(85dvh,820px)] w-full max-w-lg flex-1 flex-col">
      <DurakGame />
    </div>
  );
}
