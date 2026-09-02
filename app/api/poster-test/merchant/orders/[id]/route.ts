import { NextResponse } from "next/server";
import { requirePosterTestStaff } from "@/lib/poster-test-auth/api";
import { updatePosterTestOrderStatus } from "@/lib/poster-test-auth/orderService";
import type { PosterTestOrderStatus } from "@/lib/poster-test-auth/types";

export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set<PosterTestOrderStatus>([
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requirePosterTestStaff();
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, message: "Order id is required." },
      { status: 400 },
    );
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON." },
      { status: 400 },
    );
  }

  const status = body.status?.trim() as PosterTestOrderStatus | undefined;
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { success: false, message: "Invalid status." },
      { status: 400 },
    );
  }

  const order = await updatePosterTestOrderStatus(id, status);
  if (!order) {
    return NextResponse.json(
      { success: false, message: "Could not update order status." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    success: true,
    order: {
      id: order.id,
      status: order.status,
      fulfillment: order.fulfillment,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerComment: order.customerComment,
      items: order.items,
      totalVnd: order.totalVnd,
      posterOrderId: order.posterOrderId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
  });
}
