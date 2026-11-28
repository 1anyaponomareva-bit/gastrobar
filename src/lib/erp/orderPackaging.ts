/** Structured Orders packing (ERP) — not yield, not stock UOM, not free-text staff_pack. */

export type OrderPackaging = {
  type: string;
  contentQty: number | null;
  contentUnit: string;
};

export function parseOrderPackaging(product: {
  order_pack_type?: string | null;
  order_pack_content_qty?: number | null;
  order_pack_content_unit?: string | null;
}): OrderPackaging {
  const qty = product.order_pack_content_qty;
  return {
    type: String(product.order_pack_type || "").trim(),
    contentQty: typeof qty === "number" && Number.isFinite(qty) && qty > 0 ? qty : null,
    contentUnit: String(product.order_pack_content_unit || "").trim(),
  };
}

export function formatOrderPackagingLine(
  pack: OrderPackaging,
  labels: { packing: string; per: string },
): string | null {
  if (!pack.type && pack.contentQty == null && !pack.contentUnit) return null;
  const qty = pack.contentQty != null ? String(pack.contentQty) : "";
  const unit = pack.contentUnit;
  const type = pack.type || "pack";
  if (qty && unit) return `${labels.packing}: ${qty} ${unit} / ${type}`;
  if (qty) return `${labels.packing}: ${qty} / ${type}`;
  if (unit) return `${labels.packing}: ${unit} / ${type}`;
  return `${labels.packing}: ${type}`;
}

export function orderPackTotalContent(
  packCount: number,
  contentQty: number | null,
): number | null {
  if (!Number.isFinite(packCount) || packCount <= 0) return null;
  if (contentQty == null || !(contentQty > 0)) return null;
  return Math.round(packCount * contentQty * 1000) / 1000;
}

export function formatOrderPackTotal(
  packCount: number,
  contentQty: number | null,
  contentUnit: string,
  labels: { packs: string; total: string },
): string | null {
  const total = orderPackTotalContent(packCount, contentQty);
  if (total == null) return null;
  const unit = contentUnit.trim() || "pcs";
  return `${labels.packs}: ${packCount} · ${labels.total}: ${total} ${unit}`;
}
