"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildCostContext, costLine, productLabel } from "@/lib/erp/costing";
import type { ErpDocument, ErpDocumentLine, ErpRecipe, ErpState } from "@/lib/erp/types";
import { StatusBadge } from "./docs";
import { useErp } from "./ErpShell";
import {
  addDays,
  dateText,
  dateTimeText,
  Empty,
  errorText,
  Field,
  loadingText,
  NavLink,
  NumberInput,
  PageHead,
  productById,
  ProductPicker,
  qtyText,
  QtyInput,
  savingText,
  stockQty,
  T,
  Tip,
  today,
  unitLabel,
  unitOf,
  useDirtyGuard,
  vnd,
  WarehouseSelect,
} from "./ui";

type Step = 1 | 2 | 3 | 4;

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

function defaultDoc(state: ErpState, email: string): ErpDocument {
  const active = state.warehouses.filter((w) => !w.archived_at);
  const prep = active.find((w) => w.kind === "prep_kitchen")?.id ?? active[0]?.id ?? null;
  return {
    doc_type: "production",
    doc_date: today(),
    warehouse_id: prep,
    target_warehouse_id: prep,
    responsible: email,
    lines: [],
  };
}

function scaledLines(recipe: ErpRecipe, plan: number | null): ErpDocumentLine[] {
  const factor = plan && recipe.yield_qty ? plan / recipe.yield_qty : 1;
  return recipe.lines
    .filter((line) => line.product_id && line.qty)
    .map((line) => {
      const planned = round6(line.qty! * factor);
      return { product_id: line.product_id!, planned_qty: planned, qty: planned };
    });
}

function withPlan(state: ErpState, doc: ErpDocument, recipe: ErpRecipe, plan: number | null): ErpDocument {
  const unit = unitOf(state, recipe.product_id);
  const factor = plan && recipe.yield_qty ? plan / recipe.yield_qty : null;
  return {
    ...doc,
    recipe_id: recipe.id,
    output_product_id: recipe.product_id,
    plan_output_qty: plan,
    output_qty: plan,
    output_pieces:
      unit === "pcs" ? (plan === null ? null : Math.round(plan)) : recipe.yield_pieces && factor ? Math.round(recipe.yield_pieces * factor) : null,
    lines: scaledLines(recipe, plan),
  };
}

async function fetchDoc(id: string): Promise<ErpDocument> {
  const response = await fetch(`/api/erp/documents/${id}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "server");
  return data.document as ErpDocument;
}

export function ProductionWizard({ id }: { id: string }) {
  const { state, act, busy, email } = useErp();
  const router = useRouter();
  const [doc, setDoc] = useState<ErpDocument | null>(null);
  const [baseline, setBaseline] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ctx = useMemo(() => (state ? buildCostContext(state.products, state.recipes) : null), [state]);

  const loadSaved = (saved: ErpDocument) => {
    setDoc(saved);
    setBaseline(JSON.stringify(saved));
  };

  useEffect(() => {
    if (!state) return;
    if (id === "new") {
      let initial = defaultDoc(state, email);
      const recipeId = new URLSearchParams(window.location.search).get("recipe");
      const recipe = state.recipes.find((r) => r.id === recipeId && r.status === "active");
      if (recipe) initial = withPlan(state, initial, recipe, recipe.yield_qty);
      loadSaved(initial);
      return;
    }
    fetchDoc(id)
      .then((saved) => {
        if (saved.doc_type !== "production") {
          router.replace(`/erp/documents/${id}`);
          return;
        }
        loadSaved(saved);
        if (saved.status && saved.status !== "draft") setStep(4);
      })
      .catch((error: Error) => setLoadError(errorText(error.message)));
    // Only on first render: later data reloads must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(state)]);

  const editable = !doc?.status || doc.status === "draft";
  const dirty = Boolean(doc) && editable && JSON.stringify(doc) !== baseline;
  useDirtyGuard(dirty);

  if (loadError) {
    return (
      <Empty
        kind="error"
        title={T("Не удалось открыть партию", "Could not open the batch", "Không mở được mẻ")}
        text={loadError}
        action={
          <NavLink href="/erp/preps/batches" className="erpBtn">
            {T("К списку партий", "Back to batches", "Về danh sách mẻ")}
          </NavLink>
        }
      />
    );
  }
  if (!state || !ctx || !doc) return <div className="erpLoading">{loadingText()}</div>;

  const set = <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => setDoc((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setLines = (update: (lines: ErpDocumentLine[]) => ErpDocumentLine[]) => setDoc((prev) => (prev ? { ...prev, lines: update(prev.lines) } : prev));

  const recipe = state.recipes.find((r) => r.id === doc.recipe_id) ?? null;
  const output = productById(state, doc.output_product_id);
  const outUnit = output?.base_unit ?? null;
  const shelf = output?.shelf_life_days ?? recipe?.shelf_life_days ?? null;
  const autoExpiry = shelf && doc.doc_date ? addDays(doc.doc_date, shelf) : null;
  const posted = doc.status === "posted" || doc.status === "cancelled";

  const shortages = doc.lines
    .filter((line) => line.product_id)
    .map((line) => ({ line, available: stockQty(state, line.product_id, doc.warehouse_id) }))
    .filter(({ line, available }) => available < line.qty);

  const estimate = doc.lines.length
    ? doc.lines.reduce<number | null>((sum, line) => {
        if (sum === null || !line.product_id) return null;
        const cost = costLine(ctx, line.product_id, line.qty).cost;
        return cost === null ? null : sum + cost;
      }, 0)
    : null;
  const batchCost = posted ? (doc.cost_known ? (doc.total_cost ?? null) : null) : estimate;
  const unitCost = posted ? (doc.output_unit_cost ?? null) : batchCost !== null && doc.output_qty ? batchCost / doc.output_qty : null;

  const valid: Record<Step, boolean> = {
    1: Boolean(recipe && doc.plan_output_qty && doc.plan_output_qty > 0),
    2: Boolean(doc.warehouse_id && doc.target_warehouse_id),
    3: Boolean(doc.output_qty && doc.output_qty > 0 && doc.lines.length && doc.lines.every((line) => line.product_id && line.qty > 0)),
    4: true,
  };
  const reachable = (target: Step) => ([1, 2, 3] as Step[]).filter((s) => s < target).every((s) => valid[s]);

  const payload = () => {
    const body: ErpDocument = { ...doc };
    // The database fills expiry from the product card; recipe-only shelf life is sent explicitly.
    if (!body.expires_at && !output?.shelf_life_days && autoExpiry) body.expires_at = autoExpiry;
    return body as unknown as Record<string, unknown>;
  };

  const saveDraft = async (successText: string | false): Promise<string | null> => {
    const result = await act<{ id: string }>({ action: "saveDocument", document: payload() }, successText);
    if (!result) return null;
    if (!doc.id) window.history.replaceState(null, "", `/erp/preps/batch/${result.id}`);
    try {
      loadSaved(await fetchDoc(result.id));
    } catch {
      setBaseline(JSON.stringify(doc));
    }
    return result.id;
  };

  const confirmProduction = async () => {
    const savedId = await saveDraft(false);
    if (!savedId) return;
    await act({ action: "postDocument", id: savedId }, T("Производство подтверждено", "Production confirmed", "Đã xác nhận sản xuất"));
    try {
      loadSaved(await fetchDoc(savedId));
    } catch {
      /* the list shows the result */
    }
  };

  const cancelBatch = async () => {
    const reason = window.prompt(T("Причина отмены производства", "Why is this production cancelled?", "Lý do hủy sản xuất"));
    if (!reason?.trim() || !doc.id) return;
    if (await act({ action: "cancelDocument", id: doc.id, reason }, T("Производство отменено", "Production cancelled", "Đã hủy sản xuất"))) {
      loadSaved(await fetchDoc(doc.id));
    }
  };

  const deleteDraft = async () => {
    if (!doc.id || !window.confirm(T("Удалить черновик производства?", "Delete this production draft?", "Xóa bản nháp sản xuất?"))) return;
    if (await act({ action: "deleteDraft", id: doc.id }, T("Черновик удалён", "Draft deleted", "Đã xóa bản nháp"))) {
      setBaseline(JSON.stringify(doc));
      router.push("/erp/preps/batches");
    }
  };

  const stepNames: Record<Step, string> = {
    1: T("Что готовим", "What", "Món gì"),
    2: T("Где готовим", "Where", "Ở đâu"),
    3: T("Расход и выход", "Usage and yield", "Tiêu hao và sản lượng"),
    4: T("Проверка", "Review", "Kiểm tra"),
  };

  const title = posted
    ? `${T("Партия", "Batch", "Mẻ")} ${doc.batch_no ?? doc.doc_no ?? ""}`
    : T("Изготовить партию", "Make a batch", "Sản xuất mẻ");

  return (
    <>
      <NavLink href="/erp/preps/batches" className="erpBack">
        ← {T("Изготовленные партии", "Produced batches", "Mẻ đã sản xuất")}
      </NavLink>
      <PageHead
        title={
          <>
            {title} {doc.status ? <StatusBadge status={doc.status} /> : null}
          </>
        }
        sub={
          output
            ? `${productLabel(output)}${doc.doc_no && !posted ? ` · ${T("черновик", "draft", "nháp")} ${doc.doc_no}` : ""}`
            : T("Выпуск полуфабриката по рецептуре", "Produce a semi-finished product from its recipe", "Sản xuất bán thành phẩm theo công thức")
        }
      />

      {editable ? (
        <ol className="erpStepper">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <li key={s} className={s === step ? "current" : s < step ? "done" : ""}>
              <button type="button" disabled={!reachable(s)} onClick={() => setStep(s)}>
                <span className="bar" />
                <small>
                  {T("Шаг", "Step", "Bước")} {s}
                </small>
                <span className="label">{stepNames[s]}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {editable && step === 1 ? (
        <StepWhat state={state} doc={doc} recipe={recipe} onRecipe={(r) => setDoc(withPlan(state, doc, r, r.yield_qty))} onPlan={(plan) => recipe && setDoc(withPlan(state, doc, recipe, plan))} />
      ) : null}

      {editable && step === 2 ? <StepWhere state={state} doc={doc} set={set} shortages={shortages.length} /> : null}

      {editable && step === 3 ? <StepUsage state={state} doc={doc} recipe={recipe} set={set} setLines={setLines} /> : null}

      {step === 4 || posted ? (
        <StepReview
          state={state}
          doc={doc}
          editable={editable}
          set={set}
          shortages={shortages}
          batchCost={batchCost}
          unitCost={unitCost}
          autoExpiry={autoExpiry}
          ctxCost={(line) => (posted ? (line.cost_known === false ? null : (line.cost_amount ?? null)) : costLine(ctx, line.product_id, line.qty).cost)}
        />
      ) : null}

      {editable ? (
        <div className="erpActions split">
          <div className="erpRow">
            {step > 1 ? (
              <button type="button" className="erpBtn" onClick={() => setStep((step - 1) as Step)}>
                ← {T("Назад", "Back", "Quay lại")}
              </button>
            ) : null}
            {recipe ? (
              <button type="button" className="erpBtn ghost" disabled={busy || (!dirty && Boolean(doc.id))} onClick={() => saveDraft(T("Черновик сохранён", "Draft saved", "Đã lưu nháp"))}>
                {T("Сохранить черновик", "Save draft", "Lưu nháp")}
              </button>
            ) : null}
            {doc.id ? (
              <button type="button" className="erpBtn ghost" disabled={busy} onClick={deleteDraft}>
                {T("Удалить черновик", "Delete draft", "Xóa nháp")}
              </button>
            ) : null}
          </div>
          {step < 4 ? (
            <button type="button" className="erpBtn primary" disabled={!valid[step]} onClick={() => setStep((step + 1) as Step)}>
              {T("Далее", "Next", "Tiếp")} →
            </button>
          ) : (
            <button type="button" className="erpBtn primary" disabled={busy || !valid[1] || !valid[2] || !valid[3] || shortages.length > 0} onClick={confirmProduction}>
              {busy ? savingText() : T("Подтвердить производство", "Confirm production", "Xác nhận sản xuất")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="erpActions">
            {recipe && recipe.status === "active" && doc.status === "posted" ? (
              <NavLink href={`/erp/preps/batch/new?recipe=${recipe.id}`} className="erpBtn primary">
                {T("Изготовить ещё партию", "Make another batch", "Sản xuất thêm mẻ")}
              </NavLink>
            ) : null}
            <NavLink href="/erp/stock" className="erpBtn">
              {T("Открыть остатки", "Open stock", "Xem tồn kho")}
            </NavLink>
            {doc.status === "posted" ? (
              <button type="button" className="erpBtn danger" disabled={busy} onClick={cancelBatch}>
                {T("Отменить производство", "Cancel production", "Hủy sản xuất")}
              </button>
            ) : null}
          </div>
          <p className="erpHint">
            {T("Подтвердил", "Confirmed by", "Xác nhận bởi")} {doc.posted_by ?? "—"} · {dateTimeText(doc.posted_at)}
            {doc.status === "cancelled" ? ` · ${T("отменил", "cancelled by", "hủy bởi")} ${doc.cancelled_by} · ${dateTimeText(doc.cancelled_at)}: ${doc.cancel_reason}` : ""}
          </p>
        </>
      )}
    </>
  );
}

function StepWhat({
  state,
  doc,
  recipe,
  onRecipe,
  onPlan,
}: {
  state: ErpState;
  doc: ErpDocument;
  recipe: ErpRecipe | null;
  onRecipe: (recipe: ErpRecipe) => void;
  onPlan: (plan: number | null) => void;
}) {
  const recipes = state.recipes
    .filter((r) => (r.status === "active" || r.id === doc.recipe_id) && productById(state, r.product_id))
    .sort((a, b) => productById(state, a.product_id)!.name_en.localeCompare(productById(state, b.product_id)!.name_en));
  const drafts = state.recipes.filter((r) => r.status === "draft").length;
  const unit = unitOf(state, recipe?.product_id);

  if (!recipes.length) {
    return (
      <Empty
        title={T("Нет действующих рецептур", "No active recipes", "Chưa có công thức đang dùng")}
        text={
          <>
            {T(
              "Чтобы изготовить партию, нужна рецептура с составом и нормативным выходом.",
              "To make a batch you need a recipe with ingredients and a standard yield.",
              "Cần có công thức với thành phần và sản lượng chuẩn.",
            )}
            {drafts
              ? ` ${T(`Черновиков рецептур: ${drafts} — откройте их и сделайте действующими.`, `${drafts} recipe draft(s) — open them and make them active.`, `${drafts} bản nháp — mở và áp dụng.`)}`
              : ""}
          </>
        }
        action={
          <>
            <NavLink href={drafts ? "/erp/preps" : "/erp/preps/recipe/new"} className="erpBtn primary">
              {drafts ? T("Открыть рецептуры", "Open recipes", "Mở công thức") : T("Создать рецептуру", "Create a recipe", "Tạo công thức")}
            </NavLink>
            <NavLink href="/erp/service/import" className="erpBtn">
              {T("Загрузить из Recipes", "Import from Recipes", "Nhập từ Recipes")}
            </NavLink>
          </>
        }
      />
    );
  }

  return (
    <div className="erpCard">
      <h2>{T("Шаг 1. Что готовим", "Step 1. What are we making", "Bước 1. Làm món gì")}</h2>
      <div className="erpGrid two">
        <Field label={T("Полуфабрикат *", "Semi-finished product *", "Bán thành phẩm *")}>
          <select
            value={doc.recipe_id ?? ""}
            onChange={(event) => {
              const next = state.recipes.find((r) => r.id === event.target.value);
              if (next) onRecipe(next);
            }}
          >
            <option value="">{T("— выберите —", "— choose —", "— chọn —")}</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {productLabel(productById(state, r.product_id)!)}
                {r.status !== "active" ? ` (v${r.version})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={T("Плановое количество *", "Planned quantity *", "Số lượng kế hoạch *")}
          hint={
            recipe?.yield_qty
              ? `${T("По рецептуре выход", "Recipe yield", "Sản lượng công thức")}: ${qtyText(recipe.yield_qty, unit)}${recipe.yield_pieces && unit !== "pcs" ? ` · ${recipe.yield_pieces} ${unitLabel("pcs")}` : ""}`
              : undefined
          }
        >
          {recipe ? (
            <QtyInput base={unit} value={doc.plan_output_qty} onChange={onPlan} />
          ) : (
            <span className="erpNoUnit">{T("Сначала выберите полуфабрикат", "Choose a product first", "Chọn bán thành phẩm trước")}</span>
          )}
        </Field>
      </div>
      {recipe ? (
        <p className="erpHint">
          {T(
            "Состав рецептуры будет пересчитан на плановое количество. Фактический расход можно поправить на шаге 3.",
            "The recipe will be scaled to the planned quantity. You can adjust actual usage in step 3.",
            "Công thức sẽ được tính lại theo số lượng kế hoạch. Có thể sửa ở bước 3.",
          )}
        </p>
      ) : null}
    </div>
  );
}

function StepWhere({
  state,
  doc,
  set,
  shortages,
}: {
  state: ErpState;
  doc: ErpDocument;
  set: <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => void;
  shortages: number;
}) {
  return (
    <div className="erpCard">
      <h2>{T("Шаг 2. Где готовим", "Step 2. Where", "Bước 2. Ở đâu")}</h2>
      <div className="erpGrid two">
        <Field
          label={T("Склад сырья *", "Ingredients from *", "Lấy nguyên liệu từ *")}
          hint={T("Отсюда спишутся продукты по рецептуре", "Ingredients are taken from here", "Nguyên liệu sẽ được trừ ở đây")}
        >
          <WarehouseSelect warehouses={state.warehouses} value={doc.warehouse_id} onChange={(v) => set("warehouse_id", v || null)} />
        </Field>
        <Field
          label={T("Куда поступит полуфабрикат *", "Put the result into *", "Nhập thành phẩm vào *")}
          hint={T("Готовая партия появится на этом складе", "The finished batch appears here", "Mẻ thành phẩm sẽ ở kho này")}
        >
          <WarehouseSelect warehouses={state.warehouses} value={doc.target_warehouse_id} onChange={(v) => set("target_warehouse_id", v || null)} />
        </Field>
      </div>
      {doc.warehouse_id && doc.lines.length ? (
        shortages ? (
          <div className="erpNotice warn">
            {T(
              `На этом складе не хватает сырья (позиций: ${shortages}). Что именно — на следующем шаге; можно выбрать другой склад.`,
              `Some ingredients are short at this location (${shortages}). Details in the next step; you can pick another location.`,
              `Kho này thiếu nguyên liệu (${shortages}). Xem chi tiết ở bước sau hoặc chọn kho khác.`,
            )}
          </div>
        ) : (
          <div className="erpNotice ok">{T("Всех продуктов на складе достаточно.", "There is enough of every ingredient.", "Đủ tất cả nguyên liệu.")}</div>
        )
      ) : null}
    </div>
  );
}

function StepUsage({
  state,
  doc,
  recipe,
  set,
  setLines,
}: {
  state: ErpState;
  doc: ErpDocument;
  recipe: ErpRecipe | null;
  set: <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => void;
  setLines: (update: (lines: ErpDocumentLine[]) => ErpDocumentLine[]) => void;
}) {
  const outUnit = unitOf(state, doc.output_product_id);
  const update = (index: number, patch: Partial<ErpDocumentLine>) => setLines((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  return (
    <>
      <div className="erpCard">
        <h2>{T("Шаг 3. Фактический расход", "Step 3. Actual usage", "Bước 3. Tiêu hao thực tế")}</h2>
        <p className="erpHint">
          {T("Склад сырья", "Ingredients from", "Kho nguyên liệu")}: <b>{state.warehouses.find((w) => w.id === doc.warehouse_id)?.name ?? "—"}</b>
        </p>
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                <th className="num">{T("По рецептуре", "By recipe", "Theo công thức")}</th>
                <th>{T("Фактически израсходовано", "Actually used", "Thực tế đã dùng")}</th>
                <th className="num">{T("Есть на складе", "In stock", "Tồn kho")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, index) => {
                const unit = unitOf(state, line.product_id);
                const available = stockQty(state, line.product_id, doc.warehouse_id);
                const short = line.product_id && available < line.qty;
                const fromRecipe = line.planned_qty !== null && line.planned_qty !== undefined;
                return (
                  <tr key={line.id ?? index} className={short ? "short" : ""}>
                    <td className="main" style={{ minWidth: 220 }}>
                      {fromRecipe || !doc.id || line.product_id ? (
                        line.product_id && fromRecipe ? (
                          <span className="erpName">{productLabel(productById(state, line.product_id) ?? { name_en: "?", name_vn: "" })}</span>
                        ) : (
                          <ProductPicker state={state} value={line.product_id} onChange={(productId) => update(index, { product_id: productId })} />
                        )
                      ) : null}
                      {short ? (
                        <span className="erpShort">
                          {T("Не хватает", "Short by", "Thiếu")} {qtyText(line.qty - available, unit)}
                        </span>
                      ) : null}
                    </td>
                    <td className="num" data-label={T("По рецептуре", "By recipe", "Theo công thức")}>
                      {fromRecipe ? qtyText(line.planned_qty, unit) : T("добавлено", "added", "thêm")}
                    </td>
                    <td className="edit" data-label={T("Фактически", "Actually used", "Thực tế")}>
                      {line.product_id ? (
                        <QtyInput base={unit} value={line.qty} defaultSmall={unit !== "pcs" && line.qty > 0 && line.qty < 1} onChange={(v) => update(index, { qty: v ?? 0 })} />
                      ) : (
                        <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                      )}
                    </td>
                    <td className="num" data-label={T("Есть на складе", "In stock", "Tồn kho")}>
                      {line.product_id ? <span className={short ? "erpBadge bad" : ""}>{qtyText(available, unit)}</span> : "—"}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="erpIconBtn"
                        aria-label={T("Убрать строку", "Remove line", "Xóa dòng")}
                        onClick={() => setLines((lines) => lines.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="erpActions">
          <button type="button" className="erpBtn" onClick={() => setLines((lines) => [...lines, { product_id: "", qty: 0, planned_qty: null }])}>
            + {T("Добавить продукт", "Add product", "Thêm sản phẩm")}
          </button>
        </div>
      </div>

      <div className="erpCard">
        <h2>{T("Фактический выход", "Actual yield", "Sản lượng thực tế")}</h2>
        <div className="erpGrid">
          <Field
            label={`${T("Получилось", "Produced", "Thu được")} *`}
            hint={doc.plan_output_qty ? `${T("План", "Plan", "Kế hoạch")}: ${qtyText(doc.plan_output_qty, outUnit)}` : undefined}
          >
            <QtyInput
              base={outUnit}
              value={doc.output_qty}
              onChange={(v) => {
                set("output_qty", v);
                if (outUnit === "pcs") set("output_pieces", v === null ? null : Math.round(v));
              }}
            />
          </Field>
          {outUnit === "pcs" ? (
            <Field
              label={T("Общий вес партии, кг", "Total batch weight, kg", "Tổng khối lượng mẻ, kg")}
              hint={T("Необязательно — для цены за кг", "Optional — for the cost per kg", "Không bắt buộc — để tính giá mỗi kg")}
            >
              <NumberInput value={doc.output_weight_kg} onChange={(v) => set("output_weight_kg", v)} />
            </Field>
          ) : recipe?.yield_pieces ? (
            <Field label={T("Количество штук", "Number of pieces", "Số cái")}>
              <NumberInput value={doc.output_pieces} onChange={(v) => set("output_pieces", v === null ? null : Math.round(v))} />
            </Field>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StepReview({
  state,
  doc,
  editable,
  set,
  shortages,
  batchCost,
  unitCost,
  autoExpiry,
  ctxCost,
}: {
  state: ErpState;
  doc: ErpDocument;
  editable: boolean;
  set: <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => void;
  shortages: { line: ErpDocumentLine; available: number }[];
  batchCost: number | null;
  unitCost: number | null;
  autoExpiry: string | null;
  ctxCost: (line: ErpDocumentLine) => number | null;
}) {
  const outUnit = unitOf(state, doc.output_product_id);
  const output = productById(state, doc.output_product_id);
  const from = state.warehouses.find((w) => w.id === doc.warehouse_id)?.name ?? "—";
  const to = state.warehouses.find((w) => w.id === doc.target_warehouse_id)?.name ?? "—";
  const posted = !editable;

  return (
    <>
      {editable ? <h2>{T("Шаг 4. Проверка", "Step 4. Review", "Bước 4. Kiểm tra")}</h2> : null}
      {editable && shortages.length ? (
        <div className="erpNotice bad">
          <strong>{T("Не хватает сырья — подтвердить нельзя", "Not enough ingredients — cannot confirm", "Thiếu nguyên liệu — không thể xác nhận")}</strong>
          <ul>
            {shortages.map(({ line, available }) => (
              <li key={line.product_id}>
                {productLabel(productById(state, line.product_id) ?? { name_en: "?", name_vn: "" })}:{" "}
                {T("нужно", "need", "cần")} {qtyText(line.qty, unitOf(state, line.product_id))}, {T("есть", "have", "có")}{" "}
                {qtyText(available, unitOf(state, line.product_id))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="erpSummary">
        <div className="erpCard">
          <h3>
            {posted ? T("Списано со склада", "Taken from", "Đã trừ khỏi kho") : T("Спишется со склада", "Will be taken from", "Sẽ trừ khỏi kho")} {from}
          </h3>
          <ul className="erpList">
            {doc.lines.map((line, index) => {
              const cost = ctxCost(line);
              return (
                <li key={line.id ?? index}>
                  <span>
                    {productLabel(productById(state, line.product_id) ?? { name_en: "?", name_vn: "" })}
                    <small className="erpCellSub">{cost === null ? T("стоимость неизвестна", "cost unknown", "chưa rõ giá") : vnd(cost)}</small>
                  </span>
                  <span>{qtyText(line.qty, unitOf(state, line.product_id))}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="erpCard">
          <h3>
            {posted ? T("Поступило на склад", "Added to", "Đã nhập vào") : T("Поступит на склад", "Will be added to", "Sẽ nhập vào")} {to}
          </h3>
          <ul className="erpList">
            <li>
              <span>{output ? productLabel(output) : "—"}</span>
              <span>{qtyText(doc.output_qty, outUnit)}</span>
            </li>
            {doc.output_weight_kg && outUnit !== "kg" ? (
              <li>
                <span>{T("Вес партии", "Batch weight", "Khối lượng mẻ")}</span>
                <span>{qtyText(doc.output_weight_kg, "kg")}</span>
              </li>
            ) : null}
            {doc.output_pieces && outUnit !== "pcs" ? (
              <li>
                <span>{T("Штук", "Pieces", "Số cái")}</span>
                <span>{qtyText(doc.output_pieces, "pcs")}</span>
              </li>
            ) : null}
          </ul>
          <div className="erpKpis">
            <div className="erpKpi">
              <span>
                {posted ? T("Себестоимость партии", "Batch cost", "Giá vốn mẻ") : T("Себестоимость партии (оценка)", "Batch cost (estimate)", "Giá vốn mẻ (ước tính)")}
              </span>
              <strong>{batchCost === null ? T("неполная", "incomplete", "chưa đủ") : vnd(batchCost)}</strong>
            </div>
            <div className="erpKpi main">
              <span>
                {T("За 1", "Per 1", "Mỗi 1")} {unitLabel(outUnit)}
              </span>
              <strong>{vnd(unitCost)}</strong>
            </div>
            {doc.output_weight_kg && outUnit !== "kg" && batchCost !== null ? (
              <div className="erpKpi">
                <span>{T("За 1 кг", "Per 1 kg", "Mỗi 1 kg")}</span>
                <strong>{vnd(batchCost / doc.output_weight_kg)}</strong>
              </div>
            ) : null}
          </div>
          {!posted ? (
            <div className="erpHint">
              {T("Оценка по текущим ценам", "Estimate at current prices", "Ước tính theo giá hiện tại")}{" "}
              <Tip>
                {T(
                  "При подтверждении в партию переходит фактическая стоимость списанных партий сырья. Позже эта стоимость не меняется.",
                  "On confirmation the batch gets the actual cost of the ingredient lots used. It does not change later.",
                  "Khi xác nhận, mẻ nhận giá vốn thực tế của các lô nguyên liệu đã dùng và không thay đổi sau đó.",
                )}
              </Tip>
            </div>
          ) : null}
        </div>

        <div className="erpCard">
          <h3>{T("Партия", "Batch", "Mẻ")}</h3>
          {editable ? (
            <div className="erpGrid">
              <Field label={T("Дата производства", "Production date", "Ngày sản xuất")}>
                <input type="date" value={doc.doc_date ?? ""} onChange={(event) => set("doc_date", event.target.value)} />
              </Field>
              <Field
                label={T("Годен до", "Use by", "Hạn dùng")}
                hint={autoExpiry && !doc.expires_at ? `${T("Автоматически", "Automatic", "Tự động")}: ${dateText(autoExpiry)}` : undefined}
              >
                <input type="date" value={doc.expires_at ?? ""} onChange={(event) => set("expires_at", event.target.value || null)} />
              </Field>
              <Field label={T("Номер партии", "Batch number", "Số lô")} hint={T("Пусто — присвоится номер документа", "Empty — the document number is used", "Để trống — dùng số chứng từ")}>
                <input value={doc.batch_no ?? ""} onChange={(event) => set("batch_no", event.target.value || null)} />
              </Field>
              <Field label={T("Ответственный", "Responsible", "Người phụ trách")}>
                <input value={doc.responsible ?? ""} onChange={(event) => set("responsible", event.target.value)} />
              </Field>
              <Field label={T("Комментарий", "Comment", "Ghi chú")} wide>
                <input value={doc.comment ?? ""} onChange={(event) => set("comment", event.target.value)} />
              </Field>
            </div>
          ) : (
            <ul className="erpList">
              <li>
                <span>{T("Номер партии", "Batch number", "Số lô")}</span>
                <span>{doc.batch_no ?? doc.doc_no}</span>
              </li>
              <li>
                <span>{T("Дата производства", "Production date", "Ngày sản xuất")}</span>
                <span>{dateText(doc.doc_date)}</span>
              </li>
              <li>
                <span>{T("Годен до", "Use by", "Hạn dùng")}</span>
                <span>{dateText(doc.expires_at)}</span>
              </li>
              <li>
                <span>{T("Ответственный", "Responsible", "Người phụ trách")}</span>
                <span>{doc.responsible ?? "—"}</span>
              </li>
              {doc.comment ? (
                <li>
                  <span>{T("Комментарий", "Comment", "Ghi chú")}</span>
                  <span>{doc.comment}</span>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
