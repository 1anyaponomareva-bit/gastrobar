"use client";

import { useState } from "react";
import { useErp } from "./ErpShell";
import { L } from "./ui";
import { reviewCounts } from "./review";

const TILES = [
  { href: "/erp/catalog", title: L("Catalog", "Danh mục"), text: L("Products, units, packs, suppliers", "Sản phẩm, đơn vị, quy cách") },
  { href: "/erp/documents/new?type=receipt", title: L("Receive goods", "Nhập hàng"), text: L("Into any warehouse, with price", "Vào kho bất kỳ, có giá") },
  { href: "/erp/documents/new?type=transfer", title: L("Transfer", "Chuyển kho"), text: L("Warehouse → Prep → Online", "Kho → Sơ chế → Online") },
  { href: "/erp/preps", title: L("Semi-finished recipes", "Công thức bán thành phẩm"), text: L("Yield, versions, cost", "Định lượng, phiên bản, giá vốn") },
  { href: "/erp/production", title: L("Production batches", "Mẻ sản xuất"), text: L("Actual use and yield", "Tiêu hao và thành phẩm thực tế") },
  { href: "/erp/menu", title: L("Menu costing", "Giá vốn món"), text: L("Food cost, packaging, margin", "Food cost, bao bì, biên lợi nhuận") },
  { href: "/erp/stock", title: L("Stock", "Tồn kho"), text: L("Balances by warehouse", "Tồn theo kho") },
];

type ImportResult = Record<string, number>;

export function ErpHome() {
  const { state, act, busy } = useErp();
  const [staffResult, setStaffResult] = useState<ImportResult | null>(null);
  const [recipesResult, setRecipesResult] = useState<ImportResult | null>(null);
  if (!state) return null;
  const counts = reviewCounts(state);
  const total = counts.lines + counts.units + counts.packs;

  return (
    <>
      <h1>GASTROFOOD ERP</h1>
      {total > 0 ? (
        <a className="erpNotice warn" href="/erp/review">
          {L("Needs review", "Cần kiểm tra")}: {total} → {L("open", "mở")}
        </a>
      ) : null}
      <div className="erpTiles" style={{ marginTop: 12 }}>
        {TILES.map((tile) => (
          <a key={tile.href} className="erpTile" href={tile.href}>
            <strong>{tile.title}</strong>
            <span>{tile.text}</span>
          </a>
        ))}
      </div>

      <h2>{L("Data transfer", "Chuyển dữ liệu")}</h2>
      <div className="erpCard">
        <p className="erpHint">
          {L(
            "Safe to repeat: items keep their Staff ids, nothing is duplicated, ERP-only fields are not overwritten.",
            "Có thể chạy lại: giữ nguyên mã Staff, không tạo trùng.",
          )}
        </p>
        <div className="erpActions">
          <button
            type="button"
            className="erpBtn"
            disabled={busy}
            onClick={async () => setStaffResult((await act<{ result: ImportResult }>({ action: "importStaffCatalog" }))?.result ?? null)}
          >
            {L("Import Staff catalog", "Nhập danh mục Staff")}
          </button>
          <button
            type="button"
            className="erpBtn"
            disabled={busy}
            onClick={async () => setRecipesResult((await act<{ result: ImportResult }>({ action: "importRecipes" }))?.result ?? null)}
          >
            {L("Import Recipes (semi-finished)", "Nhập công thức")}
          </button>
        </div>
        {staffResult ? (
          <p className="erpHint">
            Staff: {L("created", "tạo")} {staffResult.created}, {L("updated", "cập nhật")} {staffResult.updated},{" "}
            {L("packs to review", "quy cách cần kiểm tra")} {staffResult.pack_review}
          </p>
        ) : null}
        {recipesResult ? (
          <p className="erpHint">
            Recipes: {L("created", "tạo")} {recipesResult.created}, {L("refreshed drafts", "làm mới nháp")} {recipesResult.refreshed},{" "}
            {L("kept (already active)", "giữ nguyên")} {recipesResult.kept}, {L("ingredients to link", "nguyên liệu cần liên kết")}{" "}
            {recipesResult.unresolved}
          </p>
        ) : null}
      </div>
    </>
  );
}
