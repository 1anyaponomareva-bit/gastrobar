import { NextResponse } from "next/server";
import { requirePosterTestUser } from "@/lib/poster-test-auth/api";
import { createPosterTestDbOrder } from "@/lib/poster-test-auth/orderService";
import type { PosterTestOrderItem } from "@/lib/poster-test-auth/types";

export const runtime = "nodejs";

type OrderBody = {
  customer?: {
    name?: string;
    phone?: string;
    comment?: string;
    fulfillment?: string;
  };
  items?: Array<{
    id?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    selectedSausageId?: string;
    selectedSausageLabel?: string;
  }>;
};

function normalizeItems(raw: OrderBody["items"]): PosterTestOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? "Позиция"),
      quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
      unitPrice: Math.max(0, Number(item.unitPrice) || 0),
      selectedSausageId: item.selectedSausageId,
      selectedSausageLabel: item.selectedSausageLabel,
    }))
    .filter((item) => item.id && item.unitPrice > 0);
}

export async function POST(request: Request) {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth.errorResponse;

  let body: OrderBody;
  try {
    body = (await request.json()) as OrderBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_JSON",
        message: "Некорректный формат заказа.",
      },
      { status: 400 },
    );
  }

  const customerName = body.customer?.name?.trim() ?? "";
  const customerPhone = body.customer?.phone?.trim() ?? "";
  const customerComment = body.customer?.comment?.trim() ?? "";
  const fulfillment =
    body.customer?.fulfillment === "table"
      ? "table"
      : body.customer?.fulfillment === "delivery"
        ? "delivery"
        : "pickup";

  if (!customerName) {
    return NextResponse.json(
      { success: false, message: "Введите имя." },
      { status: 400 },
    );
  }
  if (!customerPhone) {
    return NextResponse.json(
      { success: false, message: "Введите телефон." },
      { status: 400 },
    );
  }

  const items = normalizeItems(body.items);
  if (items.length === 0) {
    return NextResponse.json(
      { success: false, message: "Корзина пуста." },
      { status: 400 },
    );
  }

  const totalVnd = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const order = await createPosterTestDbOrder({
    userId: auth.user.id,
    fulfillment,
    customerName,
    customerPhone,
    customerComment,
    items,
    totalVnd,
  });

  if (!order) {
    return NextResponse.json(
      {
        success: false,
        error: "ORDER_SAVE_FAILED",
        message: "Не удалось сохранить заказ.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Заказ принят. Интеграция с Poster будет подключена на следующем этапе.",
    orderId: order.id,
    response: {
      incoming_order_id: null,
    },
  });
}
