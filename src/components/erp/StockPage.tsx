"use client";

import { useState } from "react";
import { productLabel } from "@/lib/erp/costing";
import type { ErpWarehouse } from "@/lib/erp/types";
import { RefList } from "./CatalogPage";
import { useErp } from "./ErpShell";
import { L, qtyText, TYPE_LABELS, vnd } from "./ui";

const KINDS: [string, string][] = [
  ["warehouse", L("Warehouse", "Kho")],
  ["prep_kitchen", L("Prep kitchen", "Bếp sơ chế")],
  ["online_kitchen", L("Online kitchen", "Bếp online")],
  ["food_truck", L("Food truck", "Xe bán đồ ăn")],
  ["other", L("Other", "Khác")],
];

export function StockPage() {
  const { state } = useErp();
  const active = state?.warehouses.filter((w) => !w.archived_at) ?? [];
  const [warehouseId, setWarehouseId] = useState<string>(active[0]?.id ?? "");
  const [manage, setManage] = useState(false);
  if (!state) return null;

  const products = new Map(state.products.map((p) => [p.id, p]));
  const rows = state.stock
    .filter((row) => row.warehouse_id === warehouseId)
    .map((row) => ({ row, product: products.get(row.product_id)! }))
    .filter((entry) => entry.product)
    .sort((a, b) => a.product.name_en.localeCompare(b.product.name_en));
  const known = rows.reduce((sum, { row }) => sum + (row.known_value ?? 0), 0);
  const incomplete = rows.some(({ row }) => !row.cost_known);

  return (
    <>
      <h1>{L("Stock", "Tồn kho")}</h1>
      <div className="erpTabs">
        {active.map((w) => (
          <button key={w.id} type="button" className={w.id === warehouseId && !manage ? "active" : ""} onClick={() => (setWarehouseId(w.id), setManage(false))}>
            {w.name}
          </button>
        ))}
        <button type="button" className={manage ? "active" : ""} onClick={() => setManage(true)}>
          ⚙ {L("Warehouses", "Kho")}
        </button>
      </div>

      {manage ? (
        <RefList<ErpWarehouse>
          entity="warehouse"
          rows={state.warehouses}
          columns={[
            { key: "name", label: L("Name", "Tên") },
            { key: "kind", label: L("Kind", "Loại"), kind: "select", options: KINDS },
          ]}
        />
      ) : (
        <>
          <div className="erpKpis">
            <div className="erpKpi">
              <span>{L("Positions", "Mặt hàng")}</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="erpKpi">
              <span>{L("Stock value", "Giá trị tồn")}</span>
              <strong>
                {incomplete ? "≥ " : ""}
                {vnd(known)}
              </strong>
            </div>
          </div>
          {incomplete ? <p className="erpHint">{L("Some lots have unknown cost; value shown is the known part.", "Một số lô chưa có giá vốn.")}</p> : null}
          <div className="erpTableWrap">
            <table className="erpTable">
              <thead>
                <tr>
                  <th>{L("Product", "Sản phẩm")}</th>
                  <th>{L("Type", "Loại")}</th>
                  <th className="num">{L("Qty", "SL")}</th>
                  <th className="num">{L("Value", "Giá trị")}</th>
                  <th className="num">{L("Avg cost / unit", "Giá vốn TB")}</th>
                  <th>{L("Nearest expiry", "HSD gần nhất")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, product }) => (
                  <tr key={row.product_id}>
                    <td>{productLabel(product)}</td>
                    <td>{TYPE_LABELS[product.type]}</td>
                    <td className="num">{qtyText(row.qty, product.base_unit)}</td>
                    <td className="num">
                      {row.cost_known ? vnd(row.known_value) : <span className="erpBadge warn">{L("unknown", "chưa rõ")}</span>}
                    </td>
                    <td className="num">{row.cost_known && row.qty ? vnd((row.known_value ?? 0) / row.qty) : "—"}</td>
                    <td>{row.nearest_expiry ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? <div className="erpEmpty">{L("Empty", "Trống")}</div> : null}
        </>
      )}
    </>
  );
}
