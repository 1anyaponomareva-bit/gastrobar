"use client";

import {
  formatOrderPackagingLine,
  formatOrderPackTotal,
  orderPackTotalContent,
  parseOrderPackaging,
} from "@/lib/erp/orderPackaging";
import { productDisplayName } from "@/lib/erp/productName";
import {
  defaultPackId,
  isMarkedQty,
  orderPackCaption,
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
  const erpPacking = parseOrderPackaging({
    order_pack_type: product.orderPackType,
    order_pack_content_qty: product.orderPackContentQty ?? null,
    order_pack_content_unit: product.orderPackContentUnit,
  });
  const packingLine = formatOrderPackagingLine(erpPacking, {
    packing: t("order_packing_label"),
    per: "/",
  });
  const packCount = parseQty(current.qty);

  // Ingredient path: selected purchase pack (e.g. Pack 1 kg) × qty → total kg/l/pcs.
  const packBase = pack && pack.qty_base > 0 ? pack.qty_base : null;
  const packBaseUnit = pack ? orderPackUnit(pack, product.unit) : product.unit;
  const ingredientTotal =
    packCount != null && packCount > 0 && packBase != null
      ? Math.round(packCount * packBase * 1000) / 1000
      : null;

  // Structured ERP packing (often used for semi-finished / Orders packing fields).
  const erpTotal =
    packingLine && packCount != null && packCount > 0
      ? formatOrderPackTotal(packCount, erpPacking.contentQty, erpPacking.contentUnit || "pcs", {
          packs: t("order_packing_packs"),
          total: t("order_packing_total"),
        })
      : null;

  const caption = packingLine ?? (pack ? orderPackCaption(pack) : null);
  const unit = packingLine
    ? erpPacking.type || (pack ? orderPackUnit(pack, product.unit) : product.unit)
    : pack
      ? orderPackUnit(pack, product.unit)
      : product.unit;

  const packName = pack ? orderPackDisplayName(pack, lang) : "";
  const ingredientHint =
    pack && packBase != null
      ? `${t("order_packing_label")}: ${packName || pack.label} · ${fmtAmount(packBase)} ${packBaseUnit}`
      : null;
  const ingredientTotalLine =
    ingredientTotal != null && packCount != null
      ? `${t("order_packing_packs")}: ${fmtAmount(packCount)} · ${t("order_packing_total")}: ${fmtAmount(ingredientTotal)} ${packBaseUnit}`
      : null;

  // Prefer purchase-pack total for ingredients when ERP structured packing has no content unit/qty.
  const showIngredientMath = Boolean(ingredientHint) && (!erpPacking.contentQty || !erpPacking.contentUnit);
  const erpContentPreview =
    erpPacking.contentQty != null
      ? orderPackTotalContent(packCount ?? 0, erpPacking.contentQty)
      : null;

  return (
    <div className={`orders-card ${marked ? "marked" : ""}`}>
      <div className="orders-name">{productDisplayName({ locale: lang, nameEn: product.nameEn, nameVn: product.nameVn })}</div>
      {details ? <div className="orders-meta">{details}</div> : null}
      {packingLine ? <div className="orders-packHint">{packingLine}</div> : null}
      {showIngredientMath && ingredientHint ? <div className="orders-packHint">{ingredientHint}</div> : null}
      {product.packs.length > 1 ? (
        <div className="orders-field" style={{ margin: "8px 0" }}>
          <label>{packLabel}</label>
          <select className="orders-select" value={current.packId ?? ""} onChange={(event) => onPack(event.target.value)}>
            {product.packs.map((item) => {
              const name = orderPackDisplayName(item, lang);
              return (
                <option key={item.pack_id} value={item.pack_id}>
                  {item.code ? `${name} · ${item.code}` : `${name} · ${fmtAmount(item.qty_base)} ${orderPackUnit(item, product.unit)}`}
                </option>
              );
            })}
          </select>
        </div>
      ) : null}
      <QtyField label={qtyLabel} unit={unit} value={current.qty} onChange={onQty} />
      {erpTotal ? <div className="orders-packHint">{erpTotal}</div> : null}
      {showIngredientMath && ingredientTotalLine ? (
        <div className="orders-packHint">{ingredientTotalLine}</div>
      ) : null}
      {!showIngredientMath && !erpTotal && erpContentPreview != null && packCount != null && packCount > 0 ? (
        <div className="orders-packHint">
          {t("order_packing_total")}: {fmtAmount(erpContentPreview)} {erpPacking.contentUnit || "pcs"}
        </div>
      ) : null}
      {!packingLine && !showIngredientMath && caption ? <div className="orders-packHint">{caption}</div> : null}
    </div>
  );
}
