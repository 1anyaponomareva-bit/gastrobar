import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { DurakGame } from "@/components/durak/DurakGame";

export const metadata: Metadata = {
  title: "Дурак — GASTROBAR",
  description: "Подкидной дурак: игра против бота.",
};

export default function DurakPage() {
  return (
    <div className="durak-page flex h-[100svh] min-h-0 w-full flex-col overflow-x-hidden bg-[#14100c]">
      <Header />
      {/* Явная колонка высоты: иначе flex-1 у игры схлопывается, стол и кнопки не видны */}
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <DurakGame />
      </div>
      <BottomNav />
    </div>
  );
}
