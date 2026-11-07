"use client";

import { formatOrderLineName } from "@/lib/orders/orderPdf";
import {
  defaultPackId,
  isMarkedQty,
  orderPackCaption,
  orderPackUnit,
  packOf,
  productDetailLine,
  type SelectionRow,
} from "@/lib/orders/orderList";
import type { OrderProduct } from "@/lib/orders/types";
import { QtyField } from "./QtyField";

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
  const current = row ?? { packId: defaultPackId(product), qty: "" };
  const pack = packOf(product, current.packId);
  const marked = isMarkedQty(current.qty);
  const details = productDetailLine({
    brand: product.brand,
    supplierName,
    showSupplier,
    packCode: pack?.code,
  });
  const caption = pack ? orderPackCaption(pack) : null;
  const unit = pack ? orderPackUnit(pack, product.unit) : product.unit;

  return (
    <div className={`orders-card ${marked ? "marked" : ""}`}>
      <div className="orders-name">{formatOrderLineName({ nameEn: product.nameEn, nameVn: product.nameVn })}</div>
      {details ? <div className="orders-meta">{details}</div> : null}
      {product.packs.length > 1 ? (
        <div className="orders-field" style={{ margin: "8px 0" }}>
          <label>{packLabel}</label>
          <select className="orders-select" value={current.packId ?? ""} onChange={(event) => onPack(event.target.value)}>
            {product.packs.map((item) => (
              <option key={item.pack_id} value={item.pack_id}>
                {item.code ? `${item.label} · ${item.code}` : item.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <QtyField label={qtyLabel} unit={unit} value={current.qty} onChange={onQty} />
      {caption ? <div className="orders-packHint">{caption}</div> : null}
    </div>
  );
}
