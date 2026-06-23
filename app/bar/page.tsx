import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { MenuList } from "@/components/MenuList";
import { TikTokButton } from "@/components/TikTokButton";
import { MENU_AND_HOOKAH_ITEMS, MENU_ITEMS } from "@/data/menu";
import { HOOKAH_MENU_ENABLED } from "@/lib/menuFeatures";
import { MENU_PWA_METADATA } from "@/lib/menuPwaMetadata";

export const metadata: Metadata = {
  ...MENU_PWA_METADATA,
};

export default async function BarPage() {
  const menuItems = HOOKAH_MENU_ENABLED ? MENU_AND_HOOKAH_ITEMS : MENU_ITEMS;

  return (
    <>
      <Header />
      <main className="mx-auto grid min-h-[100dvh] max-w-md grid-cols-1 bg-black pt-0">
        <MenuList items={menuItems} />
      </main>
      <BottomNav />
      <TikTokButton />
    </>
  );
}
