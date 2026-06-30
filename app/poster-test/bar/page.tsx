import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { MenuList } from "@/components/MenuList";
import { TikTokButton } from "@/components/TikTokButton";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import { MENU_AND_HOOKAH_ITEMS, MENU_ITEMS } from "@/data/menu";
import { HOOKAH_MENU_ENABLED } from "@/lib/menuFeatures";
import { POSTER_TEST_BANNER_HEIGHT_PX } from "@/lib/posterTestRoutes";

export const metadata: Metadata = {
  title: "GASTROBAR — Bar menu (test)",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PosterTestBarPage() {
  const menuItems = HOOKAH_MENU_ENABLED ? MENU_AND_HOOKAH_ITEMS : MENU_ITEMS;

  return (
    <>
      <Header layoutOffsetPx={POSTER_TEST_BANNER_HEIGHT_PX} />
      <main className="mx-auto grid min-h-[100dvh] max-w-md grid-cols-1 bg-black pt-0">
        <MenuList items={menuItems} layoutOffsetPx={POSTER_TEST_BANNER_HEIGHT_PX} />
      </main>
      <PosterTestBottomNav />
      <TikTokButton />
    </>
  );
}
