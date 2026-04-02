import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { DurakShell } from "./DurakShell";

export const metadata: Metadata = {
  title: "Дурак — GASTROBAR",
  description: "Подкидной дурак: игра против бота.",
};

export default function DurakPage() {
  return (
    <div className="flex min-h-[100dvh] min-h-[100svh] w-full flex-col bg-[#14100c] text-white">
      <Header />
      {/* Header/BottomNav fixed — отступ сверху только здесь, иначе стол уезжает под чёрную шапку. */}
      <div
        className={`durak-page flex min-h-[calc(100svh-5rem)] w-full min-w-0 flex-1 flex-col overflow-x-hidden ${HEADER_OFFSET_TOP}`}
      >
        <DurakShell />
      </div>
      <BottomNav />
    </div>
  );
}
