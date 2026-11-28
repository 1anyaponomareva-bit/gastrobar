/** Structured Orders packing (ERP) — not yield, not stock UOM, not free-text staff_pack. */

export type OrderPackaging = {
  type: string;
  contentQty: number | null;
  contentUnit: string;
};

/** bag / pack / túi → readable word for the active Orders locale. */
export function localizePackType(raw: string | null | undefined, lang: string): string {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) {
    if (lang === "ru") return "пакет";
    if (lang === "vn") return "túi";
    return "pack";
  }
  if (key === "bag" || key === "пакет" || key === "пакеты" || key === "túi" || key === "tui") {
    if (lang === "ru") return "пакет";
    if (lang === "vn") return "túi";
    return "bag";
  }
  if (key === "pack" || key === "packs" || key === "упаковка") {
    if (lang === "ru") return "пакет";
    if (lang === "vn") return "pack";
    return "pack";
  }
  return String(raw || "").trim();
}

export function parseOrderPackaging(product: {
  order_pack_type?: string | null;
  order_pack_content_qty?: number | string | null;
  order_pack_content_unit?: string | null;
}): OrderPackaging {
  const raw = product.order_pack_content_qty;
  const qty =
    typeof raw === "number"
      ? raw
      : raw === null || raw === undefined || raw === ""
        ? NaN
        : Number(String(raw).trim().replace(",", "."));
  return {
    type: String(product.order_pack_type || "").trim(),
    contentQty: Number.isFinite(qty) && qty > 0 ? qty : null,
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
  looseContent = 0,
): number | null {
  const packs = Number.isFinite(packCount) && packCount > 0 ? packCount : 0;
  const loose = Number.isFinite(looseContent) && looseContent > 0 ? looseContent : 0;
  if (packs <= 0 && loose <= 0) return null;
  if (contentQty == null || !(contentQty > 0)) {
    return loose > 0 ? Math.round(loose * 1000) / 1000 : null;
  }
  return Math.round((packs * contentQty + loose) * 1000) / 1000;
}

/** Split base weight/qty into full packs + leftover content units. */
export function splitPackAndLoose(
  totalContent: number,
  contentQty: number,
): { packs: number; loose: number } {
  if (!(contentQty > 0) || !Number.isFinite(totalContent) || totalContent <= 0) {
    return { packs: 0, loose: Math.max(0, Number(totalContent) || 0) };
  }
  const packs = Math.floor((totalContent + 1e-9) / contentQty);
  const loose = Math.round((totalContent - packs * contentQty) * 1000) / 1000;
  return { packs, loose: loose > 0 ? loose : 0 };
}

export function formatOrderPackTotal(
  packCount: number,
  contentQty: number | null,
  contentUnit: string,
  labels: { packs: string; total: string },
  looseContent = 0,
): string | null {
  const total = orderPackTotalContent(packCount, contentQty, looseContent);
  if (total == null) return null;
  const unit = contentUnit.trim() || "pcs";
  const packs = Number.isFinite(packCount) && packCount > 0 ? packCount : 0;
  const loose = Number.isFinite(looseContent) && looseContent > 0 ? looseContent : 0;
  if (loose > 0 && packs > 0) {
    return `${labels.packs}: ${packs} + ${loose} ${unit} · ${labels.total}: ${total} ${unit}`;
  }
  if (loose > 0) {
    return `${labels.total}: ${total} ${unit}`;
  }
  return `${labels.packs}: ${packs} · ${labels.total}: ${total} ${unit}`;
}
