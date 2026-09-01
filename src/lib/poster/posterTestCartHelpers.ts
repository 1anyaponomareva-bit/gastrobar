import type { HotDogSausageOption, PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import type { AppLang } from "@/lib/i18n";
import { foodMenuDisplayName } from "@/lib/poster/foodMenuI18n";
import {
  BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE,
  getBuildYourOwnOptions,
  getBuildYourOwnSausageOptions,
  isBuildYourOwnHotDog,
} from "@/lib/poster/buildYourOwnHotDog";

export type CartItem = {
  key: string;
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
  selectedOptionIds?: string[];
  selectedOptionLabels?: string[];
};

export type CheckoutStep = "cart" | "show";

export function formatVnd(price: number | null | undefined): string {
  if (price == null) return "—";
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

export function displayFoodName(item: PosterFoodMenuItem, lang: AppLang = "ru"): string {
  return foodMenuDisplayName(item, lang);
}

export function getHotDogSausageOptions(item: PosterFoodMenuItem): HotDogSausageOption[] {
  if (item.hotDogNoSausage) return [];
  if (isBuildYourOwnHotDog(item.id)) {
    if (item.sausageOptions && item.sausageOptions.length > 0) return item.sausageOptions;
    return getBuildYourOwnSausageOptions(item.price ?? BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE);
  }
  return item.sausageOptions ?? [];
}

export function barUnitPrice(item: { price: string }): number {
  return Number(item.price) || 0;
}

export function cartKey(
  itemId: string,
  selectedSausageId?: string,
  selectedOptionIds: string[] = [],
): string {
  const selections = [selectedSausageId, ...selectedOptionIds.slice().sort()].filter(Boolean);
  return selections.length > 0 ? `${itemId}:${selections.join(":")}` : itemId;
}

export function selectedCartPrice(
  item: PosterFoodMenuItem,
  selectedSausageId: string,
  selectedOptionIds: string[] = [],
): {
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
  selectedOptionIds?: string[];
  selectedOptionLabels?: string[];
} {
  const selectedOptions = getBuildYourOwnOptions(selectedOptionIds);
  const extrasTotal = selectedOptions.reduce((sum, option) => sum + option.price, 0);
  const options = getHotDogSausageOptions(item);
  if (options.length > 0) {
    const selected = options.find((option) => option.id === selectedSausageId) ?? options[0];
    return {
      unitPrice: selected.price + extrasTotal,
      selectedSausageId: selected.id,
      selectedSausageLabel: selected.label,
      selectedOptionIds,
      selectedOptionLabels: selectedOptions.map((option) => option.label),
    };
  }

  return {
    unitPrice: (item.price ?? item.priceMin ?? item.priceMax ?? 0) + extrasTotal,
    selectedOptionIds,
    selectedOptionLabels: selectedOptions.map((option) => option.label),
  };
}
