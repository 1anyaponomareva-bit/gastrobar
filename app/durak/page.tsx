import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { DurakShell } from "./DurakShell";

export const metadata: Metadata = {
  title: "Дурак — GASTROBAR",
  description: "Подкидной дурак: игра против бота.",
};

export default function DurakPage() {
  return (
    <div className="flex min-h-[100dvh] min-h-[100svh] w-full flex-col bg-[#14100c] text-white">
      <Header />
      <div className="durak-page flex min-h-0 w-full flex-1 flex-col overflow-x-hidden">
        <DurakShell />
      </div>
      <BottomNav />
    </div>
  );
}
