"use client";

import {
  formatOrderPackagingLine,
  formatOrderPackTotal,
  localizePackType,
  orderPackTotalContent,
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
  onLooseQty?: (qty: string) => void;
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
  onLooseQty,
  onPack,
}: Props) {
  const { lang, t } = useOrders();
  const current = row ?? { packId: defaultPackId(product), qty: "", looseQty: "" };
  const pack = packOf(product, current.packId);
  const marked = isMarkedQty(current.qty) || isMarkedQty(current.looseQty);
  const details = productDetailLine({
    brand: product.brand,
    supplierName,
    showSupplier,
    packCode: pack?.code,
  });
  const isSemi = product.type === "semi_finished";
  const packCount = parseQty(current.qty);
  const looseCount = parseQty(current.looseQty);

  // Card packing (тип + количество в упаковке) — multiplier for weight / pcs.
  const cardPack = parseOrderPackaging({
    order_pack_type: product.orderPackType,
    order_pack_content_qty: product.orderPackContentQty ?? null,
    order_pack_content_unit: product.orderPackContentUnit || product.unit,
  });
  const hasCardMultiplier = cardPack.contentQty != null && cardPack.contentQty > 0;
  const cardUnit = cardPack.contentUnit || product.unit;
  const dualInputs = hasCardMultiplier && typeof onLooseQty === "function";
  const cardTotal = hasCardMultiplier
    ? orderPackTotalContent(packCount, cardPack.contentQty, looseCount)
    : null;

  const packWord = localizePackType(cardPack.type || "pack", lang);
  const looseUnitLabel = isSemi ? t("prep_stock_pcs") : cardUnit || product.unit;

  // Semi-finished: show bag packing line + packs+content total.
  const packingLine = isSemi
    ? formatOrderPackagingLine(
        { ...cardPack, type: packWord },
        { packing: t("order_packing_label"), per: "/" },
      )
    : hasCardMultiplier
      ? `${t("order_packing_label")}: 1 ${packWord} = ${fmtAmount(cardPack.contentQty!)} ${cardUnit}`
      : null;

  const erpTotal =
    isSemi && packingLine && cardTotal != null
      ? formatOrderPackTotal(packCount, cardPack.contentQty, cardUnit || "pcs", {
          packs: t("order_packing_packs"),
          total: t("order_packing_total"),
        }, looseCount)
      : null;

  // Ingredient without card packing: fall back to purchase pack × qty.
  const packBase = !hasCardMultiplier && pack && pack.qty_base > 0 ? pack.qty_base : null;
  const packBaseUnit = pack ? orderPackUnit(pack, product.unit) : product.unit;
  const purchaseTotal =
    !isSemi && !hasCardMultiplier && packCount != null && packCount > 0 && packBase != null
      ? Math.round(packCount * packBase * 1000) / 1000
      : null;

  const unit = hasCardMultiplier
    ? packWord
    : isSemi
      ? packWord || (pack ? orderPackUnit(pack, product.unit) : product.unit)
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
      {packingLine ? <div className="orders-packHint orders-packHintStrong">{packingLine}</div> : null}
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
      {dualInputs ? (
        <>
          <QtyField label={t("order_packing_packs")} unit={packWord} value={current.qty} onChange={onQty} />
          <QtyField
            label={isSemi ? t("prep_stock_pcs") : t("order_packing_loose", { unit: cardUnit || "kg" })}
            unit={looseUnitLabel}
            value={current.looseQty ?? ""}
            onChange={onLooseQty}
          />
        </>
      ) : (
        <QtyField
          label={hasCardMultiplier ? t("order_packing_packs") : qtyLabel}
          unit={unit}
          value={current.qty}
          onChange={onQty}
        />
      )}
      {erpTotal ? <div className="orders-packHint">{erpTotal}</div> : null}
      {totalLine ? <div className="orders-packHint orders-packHintStrong">{totalLine}</div> : null}
    </div>
  );
}
