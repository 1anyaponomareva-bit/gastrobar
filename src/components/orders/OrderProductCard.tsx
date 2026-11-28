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
  const packingTotal =
    packingLine && packCount != null && packCount > 0
      ? formatOrderPackTotal(packCount, erpPacking.contentQty, erpPacking.contentUnit, {
          packs: t("order_packing_packs"),
          total: t("order_packing_total"),
        })
      : null;
  // Prefer ERP structured packing; fall back to catalog pack caption (no free-text edit).
  const caption = packingLine ?? (pack ? orderPackCaption(pack) : null);
  const unit = packingLine
    ? erpPacking.type || (pack ? orderPackUnit(pack, product.unit) : product.unit)
    : pack
      ? orderPackUnit(pack, product.unit)
      : product.unit;

  return (
    <div className={`orders-card ${marked ? "marked" : ""}`}>
      <div className="orders-name">{productDisplayName({ locale: lang, nameEn: product.nameEn, nameVn: product.nameVn })}</div>
      {details ? <div className="orders-meta">{details}</div> : null}
      {packingLine ? <div className="orders-packHint">{packingLine}</div> : null}
      {product.packs.length > 1 && !packingLine ? (
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
      <QtyField label={qtyLabel} unit={unit} value={current.qty} onChange={onQty} />
      {packingTotal ? <div className="orders-packHint">{packingTotal}</div> : null}
      {!packingLine && caption ? <div className="orders-packHint">{caption}</div> : null}
    </div>
  );
}
