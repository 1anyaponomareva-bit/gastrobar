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
      <Header />
      <DurakGame />
      <BottomNav />
    </>
  );
}
