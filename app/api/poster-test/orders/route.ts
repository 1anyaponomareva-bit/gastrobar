import { NextResponse } from "next/server";
import { requirePosterTestUser } from "@/lib/poster-test-auth/api";
import { listPosterTestOrdersForUser } from "@/lib/poster-test-auth/orderService";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth.errorResponse;

  const orders = await listPosterTestOrdersForUser(auth.user.id);
  return NextResponse.json({
    success: true,
    orders: orders.map((order) => ({
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
    })),
  });
}
