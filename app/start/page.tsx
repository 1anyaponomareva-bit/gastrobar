import type { Metadata } from "next";
import { MenuChoiceScreen } from "@/components/MenuChoiceScreen";

export const metadata: Metadata = {
  title: "GASTROBAR — Выбор меню",
  description: "Выберите раздел: еда или бар.",
  robots: { index: false, follow: false },
};

export default function MenuChooserPage() {
  return <MenuChoiceScreen />;
}
