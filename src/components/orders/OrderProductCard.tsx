"use client";

import {
  formatOrderPackagingLine,
  formatOrderPackTotal,
  parseOrderPackaging,
} from "@/lib/erp/orderPackaging";
import { productDisplayName } from "@/lib/erp/productName";
import {
  defaultPackId,
  isMarkedQty,
  orderPackDisplayName,
  orderPackUnit,
  packOf,
  productDetailLine,
  type SelectionRow,
} from "@/lib/orders/orderList";
import { parseQty } from "@/lib/orders/qty";
import type { OrderProduct } from "@/lib/orders/types";
import { QtyField } from "./QtyField";
import { useOrders } from "./OrdersShell";

type Props = {
  product: OrderProduct;
  row?: SelectionRow;
  supplierName?: string | null;
  showSupplier: boolean;
  qtyLabel: string;
  packLabel: string;
  onQty: (qty: string) => void;
  onPack: (packId: string) => void;
};

function fmtAmount(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function OrderProductCard({
  product,
  row,
  supplierName,
  showSupplier,
  qtyLabel,
  packLabel,
  onQty,
  onPack,
}: Props) {
  const { lang, t } = useOrders();
  const current = row ?? { packId: defaultPackId(product), qty: "" };
  const pack = packOf(product, current.packId);
  const marked = isMarkedQty(current.qty);
  const details = productDetailLine({
    brand: product.brand,
    supplierName,
    showSupplier,
    packCode: pack?.code,
  });
  const isSemi = product.type === "semi_finished";
  const packCount = parseQty(current.qty);

  // Card packing (тип + количество в упаковке) — multiplier for weight / pcs.
  const cardPack = parseOrderPackaging({
    order_pack_type: product.orderPackType,
    order_pack_content_qty: product.orderPackContentQty ?? null,
    order_pack_content_unit: product.orderPackContentUnit || product.unit,
  });
  const hasCardMultiplier = cardPack.contentQty != null && cardPack.contentQty > 0;
  const cardUnit = cardPack.contentUnit || product.unit;
  const cardTotal =
    hasCardMultiplier && packCount != null && packCount > 0
      ? Math.round(packCount * (cardPack.contentQty as number) * 1000) / 1000
      : null;

  // Semi-finished: show bag packing line + packs+content total.
  const packingLine = isSemi
    ? formatOrderPackagingLine(cardPack, { packing: t("order_packing_label"), per: "/" })
    : hasCardMultiplier
      ? `${t("order_packing_label")}: 1 ${cardPack.type || "pack"} = ${fmtAmount(cardPack.contentQty!)} ${cardUnit}`
      : null;

  const erpTotal =
    isSemi && packingLine && packCount != null && packCount > 0
      ? formatOrderPackTotal(packCount, cardPack.contentQty, cardUnit || "pcs", {
          packs: t("order_packing_packs"),
          total: t("order_packing_total"),
        })
      : null;

  // Ingredient without card packing: fall back to purchase pack × qty.
  const packBase = !hasCardMultiplier && pack && pack.qty_base > 0 ? pack.qty_base : null;
  const packBaseUnit = pack ? orderPackUnit(pack, product.unit) : product.unit;
  const purchaseTotal =
    !isSemi && !hasCardMultiplier && packCount != null && packCount > 0 && packBase != null
      ? Math.round(packCount * packBase * 1000) / 1000
      : null;

  const unit = hasCardMultiplier
    ? cardPack.type || "pack"
    : isSemi
      ? cardPack.type || (pack ? orderPackUnit(pack, product.unit) : product.unit)
      : pack
        ? orderPackUnit(pack, product.unit)
        : product.unit;

  const totalLine =
    cardTotal != null
      ? `${t("order_packing_total")}: ${fmtAmount(cardTotal)} ${cardUnit}`
      : purchaseTotal != null
        ? `${t("order_packing_total")}: ${fmtAmount(purchaseTotal)} ${packBaseUnit}`
        : null;

  return (
    <div className={`orders-card ${marked ? "marked" : ""}`}>
      <div className="orders-name">{productDisplayName({ locale: lang, nameEn: product.nameEn, nameVn: product.nameVn })}</div>
      {details ? <div className="orders-meta">{details}</div> : null}
      {packingLine ? <div className="orders-packHint">{packingLine}</div> : null}
      {product.packs.length > 1 && !hasCardMultiplier ? (
        <div className="orders-field" style={{ margin: "8px 0" }}>
          <label>{packLabel}</label>
          <select className="orders-select" value={current.packId ?? ""} onChange={(event) => onPack(event.target.value)}>
            {product.packs.map((item) => {
              const name = orderPackDisplayName(item, lang);
              return (
                <option key={item.pack_id} value={item.pack_id}>
                  {item.code ? `${name} · ${item.code}` : name}
                </option>
              );
            })}
          </select>
        </div>
      ) : null}
      <QtyField
        label={hasCardMultiplier ? t("order_packing_packs") : qtyLabel}
        unit={unit}
        value={current.qty}
        onChange={onQty}
      />
      {erpTotal ? <div className="orders-packHint">{erpTotal}</div> : null}
      {totalLine ? <div className="orders-packHint">{totalLine}</div> : null}
    </div>
  );
}
