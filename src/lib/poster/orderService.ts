import { posterApiPost } from "./client";
import type { HotDogSausageOption, PosterFoodMenuItem } from "./mapProducts";
import { getPosterOrderCatalog } from "./posterOrderCatalog";
import { getPosterSpotId } from "./posterSpot";
import type {
  PosterIncomingOrderPayload,
  PosterIncomingOrderProduct,
  PosterIncomingOrderResponse,
  PosterTestOrderCustomer,
  PosterTestOrderLine,
  PosterTestOrderRequest,
  PosterTestValidatedOrder,
} from "./orderTypes";

const POSTER_ORDER_ENDPOINT = "incomingOrders.createIncomingOrder";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeQuantity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(99, Math.floor(parsed)));
}

function productModification(modifierId: string | undefined): string | undefined {
  if (!modifierId) return undefined;
  return JSON.stringify([{ m: Number(modifierId), a: 1 }]);
}

function selectedUnitPrice(
  item: PosterFoodMenuItem,
  selectedSausageId: string | undefined,
): {
  unitPrice: number;
  selectedSausageLabel?: string;
  modifierId?: string;
} {
  const sausageOptions = item.sausageOptions ?? [];
  if (sausageOptions.length > 0) {
    const selected = sausageOptions.find((option) => option.id === selectedSausageId) ?? sausageOptions[0];
    return {
      unitPrice: selected.price,
      selectedSausageLabel: selected.label,
      modifierId: selected.posterModifierId,
    };
  }

  return {
    unitPrice: item.price ?? item.priceMin ?? item.priceMax ?? 0,
  };
}

function validateOrderRequest(input: unknown): PosterTestOrderRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Некорректный формат заказа.");
  }

  const raw = input as PosterTestOrderRequest;
  const customer = raw.customer ?? ({} as PosterTestOrderRequest["customer"]);
  const name = cleanText(customer.name);
  const phone = cleanText(customer.phone);
  const comment = cleanText(customer.comment);
  const deliveryAddress = cleanText(customer.deliveryAddress);
  let fulfillment: PosterTestOrderCustomer["fulfillment"] = "pickup";
  if (customer.fulfillment === "table") fulfillment = "table";
  if (customer.fulfillment === "delivery") fulfillment = "delivery";

  if (!name) throw new Error("Введите имя.");
  if (!phone) throw new Error("Введите телефон.");
  if (fulfillment === "delivery" && !deliveryAddress) {
    throw new Error("Введите адрес доставки.");
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error("Корзина пуста.");
  }

  return {
    customer: {
      name,
      phone,
      comment,
      fulfillment,
      deliveryAddress: fulfillment === "delivery" ? deliveryAddress : undefined,
    },
    items: raw.items.map((item) => ({
      id: cleanText(item.id),
      quantity: normalizeQuantity(item.quantity),
      selectedSausageId: cleanText(item.selectedSausageId) || undefined,
    })),
  };
}

function buildComment(
  order: PosterTestOrderRequest,
  lines: PosterTestOrderLine[],
  total: number,
  websiteMeta?: {
    userId: string;
    email: string | null;
    websiteOrderId: string;
  },
): string {
  const source = "Источник: Website";
  const fulfillment =
    order.customer.fulfillment === "delivery"
      ? "Способ получения: Доставка"
      : order.customer.fulfillment === "table"
        ? "Способ получения: За столик"
        : "Способ получения: Самовывоз";
  const deliveryAddress = order.customer.deliveryAddress
    ? `Адрес доставки: ${order.customer.deliveryAddress}`
    : "";
  const customer = `Клиент: ${order.customer.name}`;
  const phone = `Телефон: ${order.customer.phone}`;
  const items = lines
    .map((line) => {
      const sausage = line.selectedSausageLabel ? ` (${line.selectedSausageLabel})` : "";
      return `${line.name}${sausage} x ${line.quantity} = ${line.total} VND`;
    })
    .join("\n");
  const userComment = order.customer.comment ? `Комментарий: ${order.customer.comment}` : "";
  const websiteLines = websiteMeta
    ? [
        `Website user_id: ${websiteMeta.userId}`,
        `Website email: ${websiteMeta.email ?? "—"}`,
        `Website order_id: ${websiteMeta.websiteOrderId}`,
      ]
    : [];

  return [
    source,
    fulfillment,
    deliveryAddress,
    customer,
    phone,
    userComment,
    "Состав заказа:",
    items,
    `Итого: ${total} VND`,
    ...websiteLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveCatalogItem(
  catalogEntry: {
    id: string;
    name: string;
    posterProductId: string;
    price: number | null;
    priceMin?: number | null;
    priceMax?: number | null;
    sausageOptions?: HotDogSausageOption[];
  },
  selectedSausageId: string | undefined,
): {
  unitPrice: number;
  selectedSausageLabel?: string;
  modifierId?: string;
} {
  const asFoodItem: PosterFoodMenuItem = {
    id: catalogEntry.id,
    posterProductId: catalogEntry.posterProductId,
    name: catalogEntry.name,
    description: "",
    price: catalogEntry.price,
    priceMin: catalogEntry.priceMin,
    priceMax: catalogEntry.priceMax,
    category: "snacks",
    image: "",
    sausageOptions: catalogEntry.sausageOptions,
  };
  return selectedUnitPrice(asFoodItem, selectedSausageId);
}

async function validateOrderAgainstPosterCatalog(
  order: PosterTestOrderRequest,
): Promise<PosterTestValidatedOrder> {
  const catalog = await getPosterOrderCatalog();
  const lines: PosterTestOrderLine[] = [];
  const posterProducts: PosterIncomingOrderProduct[] = [];

  for (const inputItem of order.items) {
    if (!inputItem.id || inputItem.quantity <= 0) continue;

    const catalogEntry = catalog.get(inputItem.id);
    if (!catalogEntry) {
      throw new Error("Одна из позиций больше недоступна в Poster.");
    }

    const { unitPrice, selectedSausageLabel, modifierId } = resolveCatalogItem(
      catalogEntry,
      inputItem.selectedSausageId,
    );
    if (unitPrice <= 0) {
      throw new Error(`Для позиции "${catalogEntry.name}" не удалось определить цену.`);
    }

    lines.push({
      id: catalogEntry.id,
      name: catalogEntry.name,
      quantity: inputItem.quantity,
      unitPrice,
      total: unitPrice * inputItem.quantity,
      selectedSausageId: inputItem.selectedSausageId,
      selectedSausageLabel,
    });

    posterProducts.push({
      product_id: catalogEntry.posterProductId,
      count: inputItem.quantity,
      modification: productModification(modifierId),
    });
  }

  if (lines.length === 0) throw new Error("Корзина пуста.");

  return {
    lines,
    posterProducts,
    total: lines.reduce((sum, line) => sum + line.total, 0),
  };
}

export type PosterWebsiteOrderMeta = {
  userId: string;
  email: string | null;
  websiteOrderId: string;
};

export async function createPosterTestOrder(
  input: unknown,
  websiteMeta?: PosterWebsiteOrderMeta,
): Promise<{
  endpoint: typeof POSTER_ORDER_ENDPOINT;
  requestPayload: PosterIncomingOrderPayload;
  response: PosterIncomingOrderResponse;
  total: number;
  lines: PosterTestOrderLine[];
}> {
  const order = validateOrderRequest(input);
  const validated = await validateOrderAgainstPosterCatalog(order);

  // One website checkout = one Poster incoming order = one spot (POSTER_SPOT_ID).
  const requestPayload: PosterIncomingOrderPayload = {
    spot_id: getPosterSpotId(),
    phone: order.customer.phone,
    first_name: order.customer.name,
    source: "Website",
    comment: buildComment(order, validated.lines, validated.total, websiteMeta),
    products: validated.posterProducts,
  };

  const result = await posterApiPost<PosterIncomingOrderResponse>(POSTER_ORDER_ENDPOINT, requestPayload);
  if (!result.ok) {
    throw new Error(result.errorText || "Poster вернул ошибку при создании заказа.");
  }

  return {
    endpoint: POSTER_ORDER_ENDPOINT,
    requestPayload,
    response: result.data,
    total: validated.total,
    lines: validated.lines,
  };
}
