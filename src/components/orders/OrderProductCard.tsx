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
  const erpPacking = parseOrderPackaging({
    order_pack_type: isSemi ? product.orderPackType : null,
    order_pack_content_qty: isSemi ? product.orderPackContentQty ?? null : null,
    order_pack_content_unit: isSemi ? product.orderPackContentUnit : null,
  });
  const packingLine = isSemi
    ? formatOrderPackagingLine(erpPacking, {
        packing: t("order_packing_label"),
        per: "/",
      })
    : null;
  const packCount = parseQty(current.qty);

  // Ingredients (and non-semi): purchase pack × qty → total in base unit.
  const packBase = pack && pack.qty_base > 0 ? pack.qty_base : null;
  const packBaseUnit = pack ? orderPackUnit(pack, product.unit) : product.unit;
  const purchaseTotal =
    !isSemi && packCount != null && packCount > 0 && packBase != null
      ? Math.round(packCount * packBase * 1000) / 1000
      : null;

  const erpTotal =
    isSemi && packingLine && packCount != null && packCount > 0
      ? formatOrderPackTotal(packCount, erpPacking.contentQty, erpPacking.contentUnit || "pcs", {
          packs: t("order_packing_packs"),
          total: t("order_packing_total"),
        })
      : null;

  const unit = isSemi
    ? erpPacking.type || (pack ? orderPackUnit(pack, product.unit) : product.unit)
    : pack
      ? orderPackUnit(pack, product.unit)
      : product.unit;

  const purchaseTotalLine =
    purchaseTotal != null && packCount != null
      ? `${t("order_packing_total")}: ${fmtAmount(purchaseTotal)} ${packBaseUnit}`
      : null;

  return (
    <div className={`orders-card ${marked ? "marked" : ""}`}>
      <div className="orders-name">{productDisplayName({ locale: lang, nameEn: product.nameEn, nameVn: product.nameVn })}</div>
      {details ? <div className="orders-meta">{details}</div> : null}
      {packingLine ? <div className="orders-packHint">{packingLine}</div> : null}
      {product.packs.length > 1 ? (
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
      {erpTotal ? <div className="orders-packHint">{erpTotal}</div> : null}
      {purchaseTotalLine ? <div className="orders-packHint">{purchaseTotalLine}</div> : null}
    </div>
  );
}
