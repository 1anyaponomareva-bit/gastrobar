import type { Metadata } from "next";
import { MenuChoiceScreen } from "@/components/MenuChoiceScreen";

export const metadata: Metadata = {
  title: "GASTROBAR — Выбор меню",
  description: "Выберите раздел: еда или бар.",
};

export default function HomePage() {
  return <MenuChoiceScreen />;
}
