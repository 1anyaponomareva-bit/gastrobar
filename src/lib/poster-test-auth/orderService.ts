import type { PosterTestOrder, PosterTestOrderItem, PosterTestOrderStatus } from "@/lib/poster-test-auth/types";
import { getPosterTestAdminClient } from "@/lib/poster-test-auth/db";

type OrderRow = {
  id: string;
  user_id: string;
  status: PosterTestOrderStatus;
  fulfillment: "pickup" | "table" | "delivery";
  customer_name: string;
  customer_phone: string;
  customer_comment: string | null;
  items: PosterTestOrderItem[];
  total_vnd: number;
  poster_order_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapOrder(row: OrderRow): PosterTestOrder {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    fulfillment: row.fulfillment,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerComment: row.customer_comment,
    items: Array.isArray(row.items) ? row.items : [],
    totalVnd: Number(row.total_vnd) || 0,
    posterOrderId: row.poster_order_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPosterTestOrdersForUser(userId: string): Promise<PosterTestOrder[]> {
  const client = getPosterTestAdminClient();
  if (!client) return [];

  const { data, error } = await client
    .from("poster_test_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrder);
}

export async function createPosterTestDbOrder(input: {
  userId: string;
  fulfillment: "pickup" | "table" | "delivery";
  customerName: string;
  customerPhone: string;
  customerComment?: string;
  items: PosterTestOrderItem[];
  totalVnd: number;
}): Promise<PosterTestOrder | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("poster_test_orders")
    .insert({
      user_id: input.userId,
      status: "pending",
      fulfillment: input.fulfillment,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_comment: input.customerComment?.trim() || null,
      items: input.items,
      total_vnd: input.totalVnd,
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapOrder(data as OrderRow);
}

export async function updatePosterTestDbOrderPosterId(
  orderId: string,
  posterOrderId: string,
): Promise<PosterTestOrder | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("poster_test_orders")
    .update({
      poster_order_id: posterOrderId,
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapOrder(data as OrderRow);
}

export async function listPosterTestOrdersForMerchant(input?: {
  since?: string;
  limit?: number;
}): Promise<PosterTestOrder[]> {
  const client = getPosterTestAdminClient();
  if (!client) return [];

  const limit = Math.min(200, Math.max(1, input?.limit ?? 100));
  let query = client
    .from("poster_test_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input?.since) {
    query = query.gte("updated_at", input.since);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrder);
}

const MERCHANT_STATUS_TRANSITIONS: Record<PosterTestOrderStatus, PosterTestOrderStatus[]> = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function updatePosterTestOrderStatus(
  orderId: string,
  nextStatus: PosterTestOrderStatus,
): Promise<PosterTestOrder | null> {
  const client = getPosterTestAdminClient();
  if (!client) return null;

  const { data: existing, error: existingError } = await client
    .from("poster_test_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (existingError || !existing) return null;

  const currentStatus = (existing as OrderRow).status;
  const allowed = MERCHANT_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return null;
  }

  const { data, error } = await client
    .from("poster_test_orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapOrder(data as OrderRow);
}
