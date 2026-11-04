"use client";

import { useMemo, useState } from "react";
import { buildCostContext, costLine, productLabel, type ErpUnit } from "@/lib/erp/costing";
import type { ErpProduct, ErpRecipe, ErpRecipeLine, ErpRecipeStep, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { Field, L, NumberInput, ProductPicker, qtyText, QtyInput, STATUS_LABELS, toBase, unitOf, vnd } from "./ui";

function stepsToText(instructions: ErpRecipe["instructions"]): string {
  if (typeof instructions === "string") return instructions;
  return (instructions as ErpRecipeStep[])
    .map((step, index) => {
      const title = step.title?.en ? `${index + 1}. ${step.title.en}${step.title.vn ? ` / ${step.title.vn}` : ""}` : `${index + 1}.`;
      const items = (step.items ?? []).map((item) => `- ${item.en ?? ""}${item.vn ? ` / ${item.vn}` : ""}`);
      return [title, ...items].join("\n");
    })
    .join("\n\n");
}

export function PrepsPage() {
  const { state } = useErp();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (!state) return null;
  const products = state.products
    .filter((p) => !p.archived_at && (p.type === "semi_finished" || p.type === "finished"))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  const product = products.find((p) => p.id === selected) ?? null;

  return (
    <>
      <h1>{L("Semi-finished recipes", "Công thức bán thành phẩm")}</h1>
      <div className="erpSplit">
        <div>
          <div className="erpList">
            {products.map((p) => {
              const recipes = state.recipes.filter((r) => r.product_id === p.id);
              const active = recipes.find((r) => r.status === "active");
              const draft = recipes.some((r) => r.status === "draft");
              return (
                <button key={p.id} type="button" className={p.id === selected ? "active" : ""} onClick={() => (setSelected(p.id), setCreating(false))}>
                  {productLabel(p)}
                  <small>
                    {active ? `v${active.version} ${STATUS_LABELS.active}` : L("no active recipe", "chưa có công thức")}
                    {draft ? ` · ${STATUS_LABELS.draft}` : ""}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="erpActions">
            <button type="button" className="erpBtn primary" onClick={() => (setCreating(true), setSelected(null))}>
              + {L("Semi-finished product", "Bán thành phẩm")}
            </button>
          </div>
        </div>
        <div>
          {creating ? (
            <NewPrep onCreated={(id) => (setSelected(id), setCreating(false))} />
          ) : product ? (
            <RecipeEditor key={product.id} state={state} product={product} />
          ) : (
            <div className="erpEmpty">{L("Choose a product on the left", "Chọn sản phẩm bên trái")}</div>
          )}
        </div>
      </div>
    </>
  );
}

function NewPrep({ onCreated }: { onCreated: (id: string) => void }) {
  const { act, busy } = useErp();
  const [nameEn, setNameEn] = useState("");
  const [nameVn, setNameVn] = useState("");
  const [unit, setUnit] = useState<ErpUnit>("kg");
  return (
    <div className="erpCard">
      <div className="erpGrid">
        <Field label={L("Name EN *", "Tên EN *")}>
          <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </Field>
        <Field label={L("Name VN", "Tên VN")}>
          <input value={nameVn} onChange={(event) => setNameVn(event.target.value)} />
        </Field>
        <Field label={L("Base unit", "Đơn vị cơ sở")}>
          <select value={unit} onChange={(event) => setUnit(event.target.value as ErpUnit)}>
            <option value="kg">kg</option>
            <option value="l">l</option>
            <option value="pcs">pcs</option>
          </select>
        </Field>
      </div>
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !nameEn.trim()}
          onClick={async () => {
            const result = await act<{ id: string }>({
              action: "saveProduct",
              product: { type: "semi_finished", name_en: nameEn, name_vn: nameVn, base_unit: unit },
            });
            if (result) onCreated(result.id);
          }}
        >
          {L("Create", "Tạo")}
        </button>
      </div>
    </div>
  );
}

type LineDraft = Pick<ErpRecipeLine, "product_id" | "qty" | "note" | "raw_name" | "raw_amount" | "raw_unit">;

function RecipeEditor({ state, product }: { state: ErpState; product: ErpProduct }) {
  const { act, busy } = useErp();
  const recipes = state.recipes.filter((r) => r.product_id === product.id).sort((a, b) => b.version - a.version);
  const initial = recipes.find((r) => r.status === "draft") ?? recipes.find((r) => r.status === "active") ?? recipes[0] ?? null;
  const [viewId, setViewId] = useState<string | null>(initial?.id ?? null);
  const viewed = recipes.find((r) => r.id === viewId) ?? null;
  const [editing, setEditing] = useState<boolean>(!viewed || viewed.status === "draft");
  const [form, setForm] = useState(() => formFrom(viewed, product));
  const ctx = useMemo(() => buildCostContext(state.products, state.recipes), [state]);
  const unit = product.base_unit;

  const open = (recipe: ErpRecipe) => {
    setViewId(recipe.id);
    setEditing(recipe.status === "draft");
    setForm(formFrom(recipe, product));
  };

  const set = <K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const setLine = (index: number, patch: Partial<LineDraft>) =>
    set("lines", form.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const save = async () => {
    const payload: Record<string, unknown> = {
      id: viewed?.id,
      product_id: product.id,
      yield_qty: form.yield_qty,
      yield_pieces: form.yield_pieces,
      shelf_life_days: form.shelf_life_days,
      storage_conditions: form.storage_conditions,
      note: form.note,
      lines: form.lines,
    };
    if (form.instructionsText !== form.instructionsOriginal) payload.instructions = form.instructionsText;
    const result = await act<{ id: string }>({ action: "saveRecipe", recipe: payload });
    if (result) {
      setViewId(result.id);
      setEditing(true);
    }
  };

  const lines = form.lines.map((line) => (line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty) : null));
  const known = lines.every((line) => line && line.cost !== null);
  const batchCost = known ? lines.reduce((sum, line) => sum + (line?.cost ?? 0), 0) : null;
  const readOnly = !editing;

  return (
    <div className="erpCard">
      <h2 style={{ marginTop: 0 }}>{productLabel(product)}</h2>
      <div className="erpTabs">
        {recipes.map((r) => (
          <button key={r.id} type="button" className={r.id === viewId ? "active" : ""} onClick={() => open(r)}>
            v{r.version} · {STATUS_LABELS[r.status]}
          </button>
        ))}
      </div>
      {viewed && viewed.status !== "draft" && !editing ? (
        <p className="erpHint">
          {L("Active and archived versions are kept as history. Editing creates a new draft version.", "Phiên bản cũ được giữ lại. Sửa sẽ tạo bản nháp mới.")}{" "}
          <button type="button" className="erpLink" onClick={() => setEditing(true)}>
            {L("Edit as new version", "Sửa thành phiên bản mới")}
          </button>
        </p>
      ) : null}

      <div className="erpGrid">
        <Field label={`${L("Yield per batch *", "Sản lượng mỗi mẻ *")} (${unit ?? "?"})`}>
          <QtyInput base={unit} value={form.yield_qty} disabled={readOnly} onChange={(v) => set("yield_qty", v)} />
        </Field>
        <Field label={L("Pieces per batch", "Số cái mỗi mẻ")}>
          <NumberInput value={form.yield_pieces} disabled={readOnly} onChange={(v) => set("yield_pieces", v === null ? null : Math.round(v))} />
        </Field>
        <Field label={L("Shelf life, days", "Hạn dùng, ngày")}>
          <NumberInput
            value={form.shelf_life_days}
            disabled={readOnly}
            onChange={(v) => set("shelf_life_days", v === null ? null : Math.round(v))}
          />
        </Field>
        <Field label={L("Storage conditions", "Điều kiện bảo quản")}>
          <input value={form.storage_conditions} disabled={readOnly} onChange={(event) => set("storage_conditions", event.target.value)} />
        </Field>
      </div>

      <h2>{L("Ingredients", "Nguyên liệu")}</h2>
      <div className="erpTableWrap">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{L("Product", "Sản phẩm")}</th>
              <th>{L("Qty per batch", "Định lượng / mẻ")}</th>
              <th className="num">{L("Cost", "Giá vốn")}</th>
              {!readOnly ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {form.lines.map((line, index) => {
              const lineUnit = unitOf(state, line.product_id);
              const cost = lines[index];
              return (
                <tr key={index}>
                  <td style={{ minWidth: 260 }}>
                    {line.raw_name && !line.product_id ? (
                      <div className="erpHint">
                        <span className="erpBadge warn">{L("link", "liên kết")}</span> {line.raw_name.en} · {line.raw_amount} {line.raw_unit}
                      </div>
                    ) : null}
                    {readOnly ? (
                      line.product_id ? (
                        productLabel(state.products.find((p) => p.id === line.product_id) ?? { name_en: "?", name_vn: "" })
                      ) : (
                        "—"
                      )
                    ) : (
                      <ProductPicker
                        state={state}
                        value={line.product_id}
                        onChange={(productId) => {
                          const base = unitOf(state, productId);
                          setLine(index, { product_id: productId || null, qty: toBase(line.raw_amount, line.raw_unit, base) ?? line.qty });
                        }}
                      />
                    )}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    {readOnly ? (
                      qtyText(line.qty, lineUnit)
                    ) : (
                      <QtyInput base={lineUnit} value={line.qty} defaultSmall={lineUnit !== "pcs"} onChange={(v) => setLine(index, { qty: v })} />
                    )}
                  </td>
                  <td className="num">
                    {!cost || cost.cost === null ? <span className="erpBadge warn">{L("no price", "chưa có giá")}</span> : vnd(cost.cost)}
                  </td>
                  {!readOnly ? (
                    <td>
                      <button type="button" className="erpLink" onClick={() => set("lines", form.lines.filter((_, i) => i !== index))}>
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly ? (
        <div className="erpActions">
          <button
            type="button"
            className="erpBtn"
            onClick={() => set("lines", [...form.lines, { product_id: null, qty: null, note: null, raw_name: null, raw_amount: null, raw_unit: null }])}
          >
            + {L("Ingredient", "Nguyên liệu")}
          </button>
        </div>
      ) : null}

      <div className="erpKpis">
        <div className="erpKpi">
          <span>{L("Planned batch cost", "Giá vốn mẻ kế hoạch")}</span>
          <strong>{batchCost === null ? L("incomplete", "chưa đủ") : vnd(batchCost)}</strong>
        </div>
        <div className="erpKpi">
          <span>
            {L("Per", "Mỗi")} {unit ?? "?"}
          </span>
          <strong>{vnd(batchCost !== null && form.yield_qty ? batchCost / form.yield_qty : null)}</strong>
        </div>
        {form.yield_pieces && unit !== "pcs" ? (
          <div className="erpKpi">
            <span>{L("Per piece", "Mỗi cái")}</span>
            <strong>{vnd(batchCost !== null ? batchCost / form.yield_pieces : null)}</strong>
          </div>
        ) : null}
      </div>

      <Field label={L("Instructions", "Hướng dẫn")} wide>
        <textarea
          rows={8}
          value={form.instructionsText}
          disabled={readOnly}
          onChange={(event) => set("instructionsText", event.target.value)}
        />
      </Field>

      <div className="erpActions">
        {!readOnly ? (
          <button type="button" className="erpBtn primary" disabled={busy} onClick={save}>
            {viewed && viewed.status !== "draft" ? L("Save as new version", "Lưu thành phiên bản mới") : L("Save draft", "Lưu nháp")}
          </button>
        ) : null}
        {viewed?.status === "draft" ? (
          <button type="button" className="erpBtn" disabled={busy} onClick={async () => {
              if (await act({ action: "activateRecipe", id: viewed.id })) setEditing(false);
            }}>
            {L("Activate", "Kích hoạt")}
          </button>
        ) : null}
      </div>
      {viewed?.status === "draft" ? (
        <p className="erpHint">
          {L(
            "Activate after all ingredients are linked. The previous active version moves to the archive.",
            "Kích hoạt khi mọi nguyên liệu đã liên kết. Phiên bản cũ chuyển vào lưu trữ.",
          )}
        </p>
      ) : null}
    </div>
  );
}

type RecipeForm = {
  yield_qty: number | null;
  yield_pieces: number | null;
  shelf_life_days: number | null;
  storage_conditions: string;
  note: string;
  instructionsText: string;
  instructionsOriginal: string;
  lines: LineDraft[];
};

function formFrom(recipe: ErpRecipe | null, product: ErpProduct): RecipeForm {
  const text = recipe ? stepsToText(recipe.instructions) : "";
  return {
    yield_qty: recipe?.yield_qty ?? null,
    yield_pieces: recipe?.yield_pieces ?? null,
    shelf_life_days: recipe?.shelf_life_days ?? product.shelf_life_days ?? null,
    storage_conditions: recipe?.storage_conditions ?? product.storage_conditions ?? "",
    note: recipe?.note ?? "",
    instructionsText: text,
    instructionsOriginal: text,
    lines: (recipe?.lines ?? []).map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      note: line.note,
      raw_name: line.raw_name,
      raw_amount: line.raw_amount,
      raw_unit: line.raw_unit,
    })),
  };
}
