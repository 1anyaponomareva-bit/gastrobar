import type { HotDogSausageOption, PosterFoodMenuItem } from "@/lib/poster/mapProducts";

const HOT_DOG_LABEL = "Hot Dog";

export type CartItem = {
  key: string;
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
};

export type CheckoutStep = "cart" | "form" | "success";

export function formatVnd(price: number | null | undefined): string {
  if (price == null) return "—";
  const vnd = Number(price) || 0;
  if (vnd >= 1000) {
    const k = Math.round(vnd / 1000);
    return `${k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.000`;
  }
  return vnd.toString();
}

export function displayFoodName(item: PosterFoodMenuItem): string {
  if (item.category === "hot-dogs") {
    if (item.hotDogPrefix === false) return item.name;
    if (!item.name.toLowerCase().includes("hot dog")) {
      return `${HOT_DOG_LABEL} ${item.name}`;
    }
  }
  return item.name;
}

export function getHotDogSausageOptions(item: PosterFoodMenuItem): HotDogSausageOption[] {
  if (item.hotDogNoSausage) return [];
  return item.sausageOptions ?? [];
}

export function cartKey(itemId: string, selectedSausageId?: string): string {
  return selectedSausageId ? `${itemId}:${selectedSausageId}` : itemId;
}

export function selectedCartPrice(
  item: PosterFoodMenuItem,
  selectedSausageId: string,
): {
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
} {
  const options = getHotDogSausageOptions(item);
  if (options.length > 0) {
    const selected = options.find((option) => option.id === selectedSausageId) ?? options[0];
    return {
      unitPrice: selected.price,
      selectedSausageId: selected.id,
      selectedSausageLabel: selected.label,
    };
  }

  return {
    unitPrice: item.price ?? item.priceMin ?? item.priceMax ?? 0,
  };
}
