import { posterApiPost } from "./client";
import { getPosterMenuForVenue } from "./menuService";
import type { PosterFoodMenuItem } from "./mapProducts";
import type {
  PosterIncomingOrderPayload,
  PosterIncomingOrderProduct,
  PosterIncomingOrderResponse,
  PosterTestOrderLine,
  PosterTestOrderRequest,
  PosterTestValidatedOrder,
} from "./orderTypes";
import { findMenuItemById } from "./orderTypes";

const POSTER_ORDER_ENDPOINT = "incomingOrders.createIncomingOrder";

function getPosterSpotId(): number {
  const raw = process.env.POSTER_SPOT_ID?.trim();
  const parsed = Number(raw || "1");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

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
  const fulfillment = customer.fulfillment === "table" ? "table" : "pickup";

  if (!name) throw new Error("Введите имя.");
  if (!phone) throw new Error("Введите телефон.");
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error("Корзина пуста.");
  }

  return {
    customer: {
      name,
      phone,
      comment,
      fulfillment,
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
): string {
  const source = "Источник: Website";
  const fulfillment =
    order.customer.fulfillment === "table" ? "Способ получения: За столик" : "Способ получения: Самовывоз";
  const customer = `Клиент: ${order.customer.name}`;
  const phone = `Телефон: ${order.customer.phone}`;
  const items = lines
    .map((line) => {
      const sausage = line.selectedSausageLabel ? ` (${line.selectedSausageLabel})` : "";
      return `${line.name}${sausage} x ${line.quantity} = ${line.total} VND`;
    })
    .join("\n");
  const userComment = order.customer.comment ? `Комментарий: ${order.customer.comment}` : "";

  return [source, fulfillment, customer, phone, userComment, "Состав заказа:", items, `Итого: ${total} VND`]
    .filter(Boolean)
    .join("\n");
}

async function validateOrderAgainstPosterMenu(
  order: PosterTestOrderRequest,
): Promise<PosterTestValidatedOrder> {
  const menu = await getPosterMenuForVenue("food");
  if (!menu.success) {
    throw new Error(menu.errorText ?? "Не удалось получить актуальное меню Poster.");
  }

  const menuItems = menu.items as PosterFoodMenuItem[];
  const lines: PosterTestOrderLine[] = [];
  const posterProducts: PosterIncomingOrderProduct[] = [];

  for (const inputItem of order.items) {
    if (!inputItem.id || inputItem.quantity <= 0) continue;

    const item = findMenuItemById(menuItems, inputItem.id);
    if (!item) {
      throw new Error("Одна из позиций больше недоступна в Poster.");
    }

    const { unitPrice, selectedSausageLabel, modifierId } = selectedUnitPrice(item, inputItem.selectedSausageId);
    if (unitPrice <= 0) {
      throw new Error(`Для позиции "${item.name}" не удалось определить цену.`);
    }

    lines.push({
      id: item.id,
      name: item.name,
      quantity: inputItem.quantity,
      unitPrice,
      total: unitPrice * inputItem.quantity,
      selectedSausageId: inputItem.selectedSausageId,
      selectedSausageLabel,
    });

    posterProducts.push({
      product_id: item.posterProductId,
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

export async function createPosterTestOrder(input: unknown): Promise<{
  endpoint: typeof POSTER_ORDER_ENDPOINT;
  requestPayload: PosterIncomingOrderPayload;
  response: PosterIncomingOrderResponse;
  total: number;
  lines: PosterTestOrderLine[];
}> {
  const order = validateOrderRequest(input);
  const validated = await validateOrderAgainstPosterMenu(order);

  const requestPayload: PosterIncomingOrderPayload = {
    spot_id: getPosterSpotId(),
    phone: order.customer.phone,
    first_name: order.customer.name,
    source: "Website",
    comment: buildComment(order, validated.lines, validated.total),
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
