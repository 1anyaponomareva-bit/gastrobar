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
    <>
      {/*
        Header и BottomNav с position:fixed не должны быть flex‑детьми вместе с колонкой игры:
        в части WebView средний flex-1 схлопывается в ~0 → «чёрный экран».
      */}
      <Header />
      <div className="durak-page flex h-[100svh] min-h-0 w-full flex-col overflow-x-hidden bg-[#14100c]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DurakGame />
        </div>
      </div>
      <BottomNav />
    </>
  );
}
