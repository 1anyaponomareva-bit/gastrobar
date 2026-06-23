import type { Metadata } from "next";
import { MenuChoiceScreen } from "@/components/MenuChoiceScreen";
import { MENU_PWA_METADATA } from "@/lib/menuPwaMetadata";

export const metadata: Metadata = {
  title: "GASTROBAR — Выбор меню",
  description: "Выберите раздел: еда или бар.",
  ...MENU_PWA_METADATA,
};

export default function HomePage() {
  return <MenuChoiceScreen />;
}
