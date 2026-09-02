import { NextResponse } from "next/server";
import { requirePosterTestStaff } from "@/lib/poster-test-auth/api";
import { listPosterTestOrdersForMerchant } from "@/lib/poster-test-auth/orderService";

export const runtime = "nodejs";

function serializeOrder(order: Awaited<ReturnType<typeof listPosterTestOrdersForMerchant>>[number]) {
  return {
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
  };
}

export async function GET(request: Request) {
  const auth = await requirePosterTestStaff();
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(request.url);
  const since = url.searchParams.get("since")?.trim() || undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

  const orders = await listPosterTestOrdersForMerchant({ since, limit });
  return NextResponse.json({
    success: true,
    orders: orders.map(serializeOrder),
  });
}
