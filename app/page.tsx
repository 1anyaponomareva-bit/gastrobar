import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { MenuList } from "@/components/MenuList";
import { LuckyWheelWidget } from "@/components/LuckyWheelWidget";
import { TikTokButton } from "@/components/TikTokButton";
import { MENU_ITEMS } from "@/data/menu";

export default async function HomePage() {
  return (
    <>
      <Header />
      <main className="mx-auto grid min-h-[100dvh] max-w-md grid-cols-1 bg-black pt-0">
        <MenuList items={MENU_ITEMS} />
      </main>
      <BottomNav />
      <TikTokButton />
      <LuckyWheelWidget />
    </>
  );
}
