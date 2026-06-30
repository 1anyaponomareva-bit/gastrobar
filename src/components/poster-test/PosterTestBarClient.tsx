"use client";

import { Header } from "@/components/Header";
import { MenuList } from "@/components/MenuList";
import { TikTokButton } from "@/components/TikTokButton";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import type { MenuItem } from "@/data/menu";
import { POSTER_TEST_BANNER_HEIGHT_PX } from "@/lib/posterTestRoutes";

export function PosterTestBarClient({
  items,
  loadError,
}: {
  items: MenuItem[];
  loadError?: string | null;
}) {
  return (
    <>
      <Header layoutOffsetPx={POSTER_TEST_BANNER_HEIGHT_PX} />
      <main className="mx-auto grid min-h-[100dvh] max-w-md grid-cols-1 bg-black pt-0">
        {loadError ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-semibold text-amber-300">Poster menu unavailable</p>
            <p className="mt-2 text-xs text-white/60">{loadError}</p>
          </div>
        ) : (
          <MenuList items={items} layoutOffsetPx={POSTER_TEST_BANNER_HEIGHT_PX} />
        )}
      </main>
      <PosterTestBottomNav />
      <TikTokButton />
    </>
  );
}
