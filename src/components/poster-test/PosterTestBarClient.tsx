"use client";

import { useCallback } from "react";
import { Header } from "@/components/Header";
import { MenuList } from "@/components/MenuList";
import { PosterTestHeaderActions } from "@/components/poster-test/PosterTestHeaderActions";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import { PosterTestQuickCartControl } from "@/components/poster-test/PosterTestQuickCartControl";
import { usePosterTestCart } from "@/components/poster-test/PosterTestCartProvider";
import { usePosterTestWheelScope } from "@/components/poster-test/PosterTestWheelScopeContext";
import { TikTokButton } from "@/components/TikTokButton";
import type { MenuItem } from "@/data/menu";
import { menuItemDisplayName } from "@/lib/menuItemI18n";
import { barUnitPrice } from "@/lib/poster/posterTestCartHelpers";
import { useTranslation } from "@/lib/useTranslation";

function PosterTestBarCartControl({ item }: { item: MenuItem }) {
  const { lang } = useTranslation();
  const { cartItems, addBarItemToCart, updateCartQuantity } = usePosterTestCart();
  const label = menuItemDisplayName(item, lang);
  const quantity = cartItems.find((entry) => entry.key === item.id)?.quantity ?? 0;
  const unitPrice = barUnitPrice(item);

  const handleAdd = useCallback(() => {
    addBarItemToCart(item, label, { openCart: false });
  }, [addBarItemToCart, item, label]);

  const handleDecrease = useCallback(() => {
    updateCartQuantity(item.id, quantity - 1);
  }, [item.id, quantity, updateCartQuantity]);

  return (
    <PosterTestQuickCartControl
      label={label}
      quantity={quantity}
      canAdd={unitPrice > 0}
      onAdd={handleAdd}
      onDecrease={handleDecrease}
    />
  );
}

export function PosterTestBarClient({
  items,
  loadError,
}: {
  items: MenuItem[];
  loadError?: string | null;
}) {
  const { scope } = usePosterTestWheelScope();
  const renderBarCartControl = useCallback(
    (item: MenuItem) => <PosterTestBarCartControl item={item} />,
    [],
  );

  return (
    <>
      <Header hideLanguageMenu headerRight={<PosterTestHeaderActions />} />
      <main className="mx-auto grid min-h-[100dvh] max-w-md grid-cols-1 bg-black pt-0">
        {loadError ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-semibold text-amber-300">Poster menu unavailable</p>
            <p className="mt-2 text-xs text-white/60">{loadError}</p>
          </div>
        ) : (
          <MenuList
            items={items}
            renderBarCartControl={renderBarCartControl}
            activeBonusStorageKey={scope?.activeBonusStorageKey}
          />
        )}
      </main>
      <PosterTestBottomNav />
      <TikTokButton />
    </>
  );
}
