"use client";

import { useState } from "react";
import { productLabel, type ErpUnit } from "@/lib/erp/costing";
import type { ErpProduct, ErpRecipe, ErpRecipeLine, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { L, ProductPicker, QtyInput, toBase, unitOf } from "./ui";
import { productsWithoutPack, productsWithoutUnit, unresolvedLines } from "./review";

export function ReviewPage() {
  const { state } = useErp();
  if (!state) return null;
  const lines = unresolvedLines(state);
  const noUnit = productsWithoutUnit(state);
  const noPack = productsWithoutPack(state);

  return (
    <>
      <h1>{L("Review", "Kiểm tra")}</h1>
      <p className="erpHint">
        {L(
          "Only what could not be matched for sure is listed here. Nothing is guessed automatically.",
          "Chỉ những mục không thể khớp chắc chắn. Không tự đoán.",
        )}
      </p>

      <h2>
        {L("Recipe ingredients to link", "Nguyên liệu cần liên kết")} ({lines.length})
      </h2>
      {lines.length ? (
        <div className="erpTableWrap">
          <table className="erpTable">
            <thead>
              <tr>
                <th>{L("Recipe", "Công thức")}</th>
                <th>{L("Text in recipe", "Tên trong công thức")}</th>
                <th>{L("Catalog product", "Sản phẩm trong danh mục")}</th>
                <th>{L("Qty", "SL")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map(({ recipe, line }) => (
                <ResolveRow key={line.id} state={state} recipe={recipe} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="erpHint">✓</p>
      )}

      <h2>
        {L("Products without base unit", "Sản phẩm chưa có đơn vị cơ sở")} ({noUnit.length})
      </h2>
      {noUnit.length ? (
        <div className="erpTableWrap">
          <table className="erpTable">
            <thead>
              <tr>
                <th>{L("Product", "Sản phẩm")}</th>
                <th>{L("Staff unit / pack", "ĐV / quy cách Staff")}</th>
                <th>{L("Base unit", "Đơn vị cơ sở")}</th>
              </tr>
            </thead>
            <tbody>
              {noUnit.map((product) => (
                <UnitRow key={product.id} product={product} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="erpHint">✓</p>
      )}

      <h2>
        {L("Staff packs not converted", "Quy cách Staff chưa quy đổi")} ({noPack.length})
      </h2>
      {noPack.length ? (
        <>
          <p className="erpHint">
            {L("Add the pack size in the catalog (e.g. box = 13.5 kg) when it is known.", "Thêm quy cách trong danh mục khi biết chính xác.")}
          </p>
          <div className="erpTableWrap">
            <table className="erpTable">
              <tbody>
                {noPack.map((product) => (
                  <tr key={product.id}>
                    <td>{productLabel(product)}</td>
                    <td>
                      {product.staff_unit} · {product.staff_pack ?? L("no pack text", "không có quy cách")}
                    </td>
                    <td>
                      <a className="erpLink" href="/erp/catalog">
                        {L("Open catalog", "Mở danh mục")}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="erpHint">✓</p>
      )}
    </>
  );
}

function ResolveRow({ state, recipe, line }: { state: ErpState; recipe: ErpRecipe; line: ErpRecipeLine }) {
  const { act, busy } = useErp();
  const [productId, setProductId] = useState<string>(line.product_id ?? "");
  const [qty, setQty] = useState<number | null>(line.qty);
  const [remember, setRemember] = useState(true);
  const unit = unitOf(state, productId);
  const recipeProduct = state.products.find((p) => p.id === recipe.product_id);

  return (
    <tr>
      <td>
        {recipeProduct ? productLabel(recipeProduct) : "?"} · v{recipe.version}
      </td>
      <td>
        {line.raw_name?.en ?? "—"}
        {line.raw_name?.vn ? ` / ${line.raw_name.vn}` : ""}
        <div className="erpHint">
          {line.raw_amount} {line.raw_unit}
        </div>
      </td>
      <td style={{ minWidth: 260 }}>
        <ProductPicker
          state={state}
          value={productId}
          onChange={(id) => {
            setProductId(id);
            const converted = toBase(line.raw_amount, line.raw_unit, unitOf(state, id));
            if (converted !== null) setQty(converted);
          }}
        />
        <label className="erpCheck">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          {L("Use for the same name in other recipes", "Áp dụng cho tên giống nhau")}
        </label>
      </td>
      <td style={{ minWidth: 150 }}>
        <QtyInput base={unit} value={qty} defaultSmall={unit !== "pcs"} onChange={setQty} />
        {productId && toBase(line.raw_amount, line.raw_unit, unit) === null ? (
          <div className="erpHint">
            {L("Units differ, enter the amount in", "Đơn vị khác, nhập theo")} {unit}
          </div>
        ) : null}
      </td>
      <td>
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !productId || !qty}
          onClick={() => act({ action: "resolveRecipeLine", lineId: line.id, productId, qty: qty!, remember })}
        >
          {L("Link", "Liên kết")}
        </button>
      </td>
    </tr>
  );
}

function UnitRow({ product }: { product: ErpProduct }) {
  const { act, busy } = useErp();
  const save = (unit: ErpUnit) =>
    act({
      action: "saveProduct",
      product: {
        id: product.id,
        type: product.type,
        name_en: product.name_en,
        name_vn: product.name_vn,
        category_id: product.category_id,
        base_unit: unit,
        unit_weight_kg: product.unit_weight_kg,
        brand: product.brand,
        shelf_life_days: product.shelf_life_days,
        storage_conditions: product.storage_conditions,
      },
    });
  return (
    <tr>
      <td>{productLabel(product)}</td>
      <td>
        {product.staff_unit ?? "—"} · {product.staff_pack ?? "—"}
      </td>
      <td>
        <div className="erpRow">
          {(["kg", "l", "pcs"] as ErpUnit[]).map((unit) => (
            <button key={unit} type="button" className="erpBtn" disabled={busy} onClick={() => save(unit)}>
              {unit}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
