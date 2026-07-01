import { NextResponse } from "next/server";
import { requirePosterTestUser } from "@/lib/poster-test-auth/api";
import {
  createPosterTestDbOrder,
  updatePosterTestDbOrderPosterId,
} from "@/lib/poster-test-auth/orderService";
import { createPosterTestOrder } from "@/lib/poster/orderService";
import { getPosterSpotId } from "@/lib/poster/posterSpot";
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

  try {
    getPosterSpotId();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "POSTER_SPOT_ID_NOT_CONFIGURED",
        message: "POSTER_SPOT_ID is not configured",
      },
      { status: 503 },
    );
  }

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
    fulfillment: "pickup",
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

  try {
    const posterResult = await createPosterTestOrder(
      {
        customer: {
          name: customerName,
          phone: customerPhone,
          comment: customerComment,
          fulfillment: "pickup",
        },
        items: items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          selectedSausageId: item.selectedSausageId,
        })),
      },
      {
        userId: auth.user.id,
        email: auth.user.email,
        websiteOrderId: order.id,
      },
    );

    const posterOrderId = posterResult.response.incoming_order_id?.trim();
    if (!posterOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: "POSTER_ORDER_ID_MISSING",
          orderId: order.id,
          saved: true,
          message:
            "Заказ сохранён, но Poster не вернул номер заказа. Попробуйте ещё раз или обратитесь к персоналу.",
          poster: {
            endpoint: posterResult.endpoint,
            response: posterResult.response,
          },
        },
        { status: 502 },
      );
    }

    await updatePosterTestDbOrderPosterId(order.id, posterOrderId);

    return NextResponse.json({
      success: true,
      message: "Заказ отправлен",
      orderId: order.id,
      posterOrderId,
      totalVnd: posterResult.total,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Не удалось отправить заказ в Poster.";

    return NextResponse.json(
      {
        success: false,
        error: "POSTER_SUBMIT_FAILED",
        orderId: order.id,
        saved: true,
        message: `Заказ сохранён, но Poster не принял заказ: ${message}`,
      },
      { status: 502 },
    );
  }
}
