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
    <div className="relative min-h-[100dvh] min-h-[100svh] w-full bg-[#14100c] text-white">
      {/*
        Один корневой блок + колонка игры без лишних flex-соседей у fixed Header/BottomNav.
        Ленивая инициализация Supabase только в useEffect (совпадение SSR/CSR), иначе гидратация ломается.
      */}
      <Header />
      <div className="durak-page flex h-[100svh] min-h-0 w-full flex-col overflow-x-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DurakGame />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
