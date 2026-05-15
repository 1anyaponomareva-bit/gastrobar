import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { MenuList } from "@/components/MenuList";
import { LuckyWheelWidget } from "@/components/LuckyWheelWidget";
import { TikTokButton } from "@/components/TikTokButton";
import { MENU_AND_HOOKAH_ITEMS, MENU_ITEMS } from "@/data/menu";
import { HOOKAH_MENU_ENABLED } from "@/lib/menuFeatures";

export default async function HomePage() {
  const menuItems = HOOKAH_MENU_ENABLED ? MENU_AND_HOOKAH_ITEMS : MENU_ITEMS;

  return (
    <>
      <Header />
      <main className="mx-auto grid min-h-[100dvh] max-w-md grid-cols-1 bg-black pt-0">
        <MenuList items={menuItems} />
      </main>
      <BottomNav />
      <TikTokButton />
      <LuckyWheelWidget />
    </>
  );
}
