"use client";

import { useEffect, useMemo, useState } from "react";
import { liveCatalogName } from "@/lib/erp/costing";
import { initialWarehouses } from "@/lib/erp/docDefaults";
import { PROCESSING_LIST_PATH, PROCESSING_NEW_HREF, processingComposition, processingDocPath } from "@/lib/erp/processing";
import type { ErpDocument, ErpDocumentLine, ErpState } from "@/lib/erp/types";
import { StatusBadge } from "./docs";
import { useErpRouter } from "./erpHref";
import { useErp } from "./ErpShell";
import { MenuMobileNav, MENU_HREFS } from "./menuNav";
import {
  dateTimeText,
  Empty,
  errorText,
  Field,
  loadingText,
  NavLink,
  productById,
  ProductPicker,
  qtyText,
  QtyInput,
  savingText,
  stockQty,
  T,
  today,
  unitOf,
  useDirtyGuard,
  vnd,
  WarehouseSelect,
} from "./ui";
import "./processing.css";

const LIST_HREF = PROCESSING_LIST_PATH;

type SavedDoc = { id: string; document?: ErpDocument | null };

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null);

function defaultDoc(state: ErpState, email: string): ErpDocument {
  const warehouses = initialWarehouses("production", state.warehouses, null);
  return {
    doc_type: "production",
    doc_date: today(),
    doc_time: nowTime(),
    warehouse_id: warehouses.warehouse_id,
    target_warehouse_id: warehouses.target_warehouse_id,
    responsible: email,
    client_key: newKey(),
    lines: [],
  };
}

function applyTechCard(state: ErpState, doc: ErpDocument, outputId: string | null, qty: number | null): ErpDocument {
  const extras = doc.lines.filter((line) => line.planned_qty == null);
  const composition = processingComposition({
    recipes: state.recipes,
    dishes: state.dishes,
    outputId,
    outputQty: qty,
  });
  const unit = unitOf(state, outputId);
  return {
    ...doc,
    recipe_id: composition.recipeId,
    output_product_id: outputId,
    plan_output_qty: qty,
    output_qty: qty,
    output_pieces: unit === "pcs" && qty != null ? Math.round(qty) : doc.output_pieces,
    lines: [...composition.lines, ...extras],
  };
}

function copyOf(state: ErpState, base: ErpDocument, source: ErpDocument): ErpDocument {
  return {
    ...base,
    warehouse_id: source.warehouse_id ?? base.warehouse_id,
    target_warehouse_id: source.target_warehouse_id ?? base.target_warehouse_id,
    comment: source.comment ?? null,
    recipe_id: source.recipe_id ?? null,
    output_product_id: source.output_product_id ?? null,
    plan_output_qty: source.plan_output_qty ?? source.output_qty ?? null,
    output_qty: source.output_qty ?? source.plan_output_qty ?? null,
    output_pieces: source.output_pieces ?? null,
    lines: (source.lines ?? []).map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      planned_qty: line.planned_qty ?? null,
    })),
  };
}

async function fetchDoc(id: string): Promise<ErpDocument> {
  const response = await fetch(`/api/erp/documents/${id}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "server");
  return data.document as ErpDocument;
}

export function ProcessingEditor({ id }: { id: string }) {
  const { state, act, busy, email } = useErp();
  const router = useErpRouter();
  const [doc, setDoc] = useState<ErpDocument | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSaved = (saved: ErpDocument) => {
    setDoc(saved);
    setBaseline(JSON.stringify(saved));
  };

  useEffect(() => {
    if (!state) return;
    const params = new URLSearchParams(window.location.search);
    if (id === "new") {
      let initial = defaultDoc(state, email);
      const recipeId = params.get("recipe");
      const recipe = recipeId ? state.recipes.find((r) => r.id === recipeId) : null;
      if (recipe) initial = applyTechCard(state, initial, recipe.product_id, recipe.yield_qty);
      const productId = params.get("product");
      if (productId && !recipe) {
        const product = productById(state, productId);
        if (product) initial = applyTechCard(state, initial, product.id, product.base_unit === "pcs" ? 1 : null);
      }
      const copy = params.get("copy");
      if (copy) {
        fetchDoc(copy)
          .then((source) => {
            loadSaved(copyOf(state, initial, source));
          })
          .catch((error: Error) => setLoadError(errorText(error.message)));
        return;
      }
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
      })
      .catch((error: Error) => setLoadError(errorText(error.message)));
    // Only on first render: later data reloads must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(state)]);

  const editable = !doc?.status || doc.status === "draft";
  const dirty = Boolean(doc) && editable && JSON.stringify(doc) !== baseline;
  useDirtyGuard(dirty);

  const composition = useMemo(
    () =>
      state && doc
        ? processingComposition({
            recipes: state.recipes,
            dishes: state.dishes,
            outputId: doc.output_product_id,
            outputQty: doc.output_qty ?? doc.plan_output_qty,
          })
        : null,
    [state, doc],
  );

  if (loadError) {
    return (
      <Empty
        kind="error"
        title={T("Не удалось открыть переработку", "Could not open processing", "Không mở được chế biến")}
        text={loadError}
        action={
          <NavLink href={LIST_HREF} className="erpBtn">
            {T("К переработкам", "Back to processing", "Về chế biến")}
          </NavLink>
        }
      />
    );
  }
  if (!state || !doc) return <div className="erpLoading">{loadingText()}</div>;

  const set = <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => setDoc((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setLines = (update: (lines: ErpDocumentLine[]) => ErpDocumentLine[]) => setDoc((prev) => (prev ? { ...prev, lines: update(prev.lines) } : prev));

  const output = productById(state, doc.output_product_id);
  const outUnit = output?.base_unit ?? null;
  const shortages = doc.lines
    .filter((line) => line.product_id && line.qty > 0)
    .map((line) => ({ line, available: stockQty(state, line.product_id, doc.warehouse_id) }))
    .filter(({ line, available }) => available < line.qty);

  const problems: string[] = [];
  if (!doc.warehouse_id) problems.push(T("Выберите склад исходных продуктов", "Choose a source location", "Chọn kho nguyên liệu"));
  if (!doc.target_warehouse_id) problems.push(T("Выберите склад полученных продуктов", "Choose a result location", "Chọn kho thành phẩm"));
  if (!doc.output_product_id) problems.push(T("Добавьте полученный продукт", "Add a result product", "Thêm sản phẩm nhận"));
  if (!doc.output_qty || doc.output_qty <= 0) problems.push(T("Укажите количество полученного продукта", "Enter the result quantity", "Nhập số lượng thành phẩm"));
  if (!doc.lines.some((line) => line.product_id && line.qty > 0)) problems.push(T("Добавьте хотя бы один исходный продукт", "Add at least one source product", "Thêm ít nhất một nguyên liệu đầu"));
  if (doc.lines.some((line) => line.product_id && !(line.qty > 0))) problems.push(T("Укажите количество в каждой строке исходных продуктов", "Enter a quantity on every source line", "Nhập số lượng cho mỗi nguyên liệu"));
  if (shortages.length) problems.push(T("На складе не хватает части исходных продуктов", "Some source products are short", "Thiếu một số nguyên liệu đầu"));

  const showSaved = (saved: ErpDocument | null | undefined) => {
    if (!saved) return setBaseline(JSON.stringify(doc));
    if (!doc.id) window.history.replaceState(null, "", processingDocPath(saved.id!));
    loadSaved(saved);
  };

  const payload = () => doc as unknown as Record<string, unknown>;

  const saveDraft = async (successText: string | false) => {
    const result = await act<SavedDoc>({ action: "saveDocument", document: payload() }, successText);
    if (result) showSaved(result.document);
  };

  const post = async () => {
    const result = await act<SavedDoc>(
      { action: "postDocument", id: doc.id, document: dirty || !doc.id ? payload() : undefined },
      T("Переработка проведена", "Processing posted", "Đã ghi sổ chế biến"),
      { onFail: (data) => showSaved(data.document as ErpDocument | undefined) },
    );
    if (result) showSaved(result.document);
  };

  const cancelDoc = async () => {
    const reason = window.prompt(T("Причина отмены переработки", "Why is this processing cancelled?", "Lý do hủy chế biến"));
    if (!reason?.trim() || !doc.id) return;
    const result = await act<SavedDoc>({ action: "cancelDocument", id: doc.id, reason }, T("Переработка отменена", "Processing cancelled", "Đã hủy chế biến"));
    if (result?.document) loadSaved(result.document);
  };

  const remove = async () => {
    if (!doc.id || !window.confirm(T("Удалить черновик переработки?", "Delete this processing draft?", "Xóa bản nháp chế biến?"))) return;
    if (await act({ action: "deleteDraft", id: doc.id }, T("Черновик удалён", "Draft deleted", "Đã xóa bản nháp"))) {
      setBaseline(JSON.stringify(doc));
      router.push(LIST_HREF);
    }
  };

  const pickOutput = (productId: string) => {
    const product = productById(state, productId);
    const qty = doc.output_qty ?? (product?.base_unit === "pcs" ? 1 : composition?.yieldQty ?? null);
    setDoc(applyTechCard(state, doc, productId || null, qty));
  };

  const pickQty = (qty: number | null) => {
    if (!doc.output_product_id) {
      set("output_qty", qty);
      set("plan_output_qty", qty);
      return;
    }
    setDoc(applyTechCard(state, { ...doc, lines: doc.lines.filter((line) => line.planned_qty == null) }, doc.output_product_id, qty));
  };

  const title = doc.status
    ? `${T("Переработка", "Processing", "Chế biến")} ${doc.doc_no ?? ""}`
    : T("Новая переработка", "New processing", "Chế biến mới");

  return (
    <div className="erpMenu erpProc">
      <NavLink href={LIST_HREF} className="erpBack">
        ← {T("Переработки", "Processing", "Chế biến")}
      </NavLink>
      <div className="erpPageHead">
        <div>
          <h1>
            {title} {doc.status ? <StatusBadge status={doc.status} /> : null}
          </h1>
          <p className="erpSub">
            {T(
              "Списывает исходные продукты и приходует полученные. Для тех. карты или полуфабриката состав берётся из текущей карточки.",
              "Writes off source products and receives the result. For a recipe or prep, ingredients come from the current tech card.",
              "Trừ nguyên liệu đầu và nhập thành phẩm. Công thức lấy từ thẻ kỹ thuật hiện tại.",
            )}
          </p>
        </div>
      </div>
      <MenuMobileNav active={MENU_HREFS.processing} />

      {doc.status === "cancelled" ? (
        <div className="erpNotice bad">
          {T("Документ отменён", "Cancelled", "Đã hủy")}: {doc.cancel_reason} · {doc.cancelled_by} · {dateTimeText(doc.cancelled_at)}
        </div>
      ) : null}

      <section className="erpCard">
        <div className="erpGrid two">
          <Field label={T("Дата и время", "Date and time", "Ngày và giờ")}>
            <div className="erpProcWhen">
              <input type="date" value={doc.doc_date ?? ""} disabled={!editable} onChange={(event) => set("doc_date", event.target.value)} />
              <input type="time" value={(doc.doc_time ?? "").slice(0, 5)} disabled={!editable} onChange={(event) => set("doc_time", event.target.value || null)} />
            </div>
          </Field>
          <Field label={T("Комментарий", "Comment", "Ghi chú")}>
            <input value={doc.comment ?? ""} disabled={!editable} onChange={(event) => set("comment", event.target.value)} />
          </Field>
          <Field label={T("Склад исходных продуктов *", "Source location *", "Kho nguyên liệu *")} hint={T("Отсюда спишутся исходные продукты", "Source products leave this location", "Nguyên liệu đầu sẽ trừ ở kho này")}>
            <WarehouseSelect warehouses={state.warehouses} value={doc.warehouse_id} disabled={!editable} onChange={(v) => set("warehouse_id", v || null)} />
          </Field>
          <Field label={T("Склад полученных продуктов *", "Result location *", "Kho thành phẩm *")} hint={T("Сюда поступит результат", "The result is received here", "Thành phẩm nhập vào kho này")}>
            <WarehouseSelect warehouses={state.warehouses} value={doc.target_warehouse_id} disabled={!editable} onChange={(v) => set("target_warehouse_id", v || null)} />
          </Field>
        </div>
      </section>

      <section className="erpCard">
        <h2>{T("Полученные продукты", "Result products", "Sản phẩm nhận")}</h2>
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                <th>{T("Количество", "Quantity", "Số lượng")}</th>
                <th className="num">{T("Доля себестоимости", "Cost share", "Tỷ lệ giá vốn")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="main" style={{ minWidth: 220 }}>
                  {editable ? (
                    <ProductPicker state={state} value={doc.output_product_id} onChange={pickOutput} />
                  ) : (
                    <span className="erpName">{liveCatalogName(state.products, doc.output_product_id)}</span>
                  )}
                  {composition?.source === "recipe" ? (
                    <span className="erpCellSub">{T("Состав из текущей тех. карты", "Composition from the current tech card", "Thành phần từ thẻ kỹ thuật hiện tại")}</span>
                  ) : composition?.source === "dish" ? (
                    <span className="erpCellSub">{T("Состав из тех. карты блюда", "Composition from the dish tech card", "Thành phần từ công thức món")}</span>
                  ) : null}
                </td>
                <td className="edit" data-label={T("Количество", "Quantity", "Số lượng")}>
                  {editable && doc.output_product_id ? (
                    <QtyInput base={outUnit} value={doc.output_qty} onChange={pickQty} />
                  ) : editable ? (
                    <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                  ) : (
                    qtyText(doc.output_qty, outUnit)
                  )}
                </td>
                <td className="num" data-label={T("Доля себестоимости", "Cost share", "Tỷ lệ giá vốn")}>
                  100%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="erpCard">
        <h2>{T("Исходные продукты", "Source products", "Nguyên liệu đầu")}</h2>
        <p className="erpHint">
          {T("Склад", "Location", "Kho")}: <b>{state.warehouses.find((w) => w.id === doc.warehouse_id)?.name ?? "—"}</b>
          {composition?.source
            ? ` · ${T("подставлено из тех. карты, количество можно поправить", "filled from the tech card; you can adjust quantities", "điền từ thẻ kỹ thuật, có thể sửa số lượng")}`
            : ""}
        </p>
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                <th className="num">{T("По карточке", "By card", "Theo thẻ")}</th>
                <th>{T("Количество", "Quantity", "Số lượng")}</th>
                <th className="num">{T("Есть на складе", "In stock", "Tồn kho")}</th>
                {editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, index) => {
                const unit = unitOf(state, line.product_id);
                const available = stockQty(state, line.product_id, doc.warehouse_id);
                const short = Boolean(line.product_id && available < line.qty);
                const fromCard = line.planned_qty != null;
                return (
                  <tr key={line.id ?? index} className={short ? "short" : ""}>
                    <td className="main" style={{ minWidth: 220 }}>
                      {fromCard || !editable ? (
                        <span className="erpName">{liveCatalogName(state.products, line.product_id)}</span>
                      ) : (
                        <ProductPicker state={state} value={line.product_id} onChange={(productId) => setLines((lines) => lines.map((item, i) => (i === index ? { ...item, product_id: productId } : item)))} />
                      )}
                      {short ? (
                        <span className="erpShort">
                          {T("Не хватает", "Short by", "Thiếu")} {qtyText(line.qty - available, unit)}
                        </span>
                      ) : null}
                    </td>
                    <td className="num" data-label={T("По карточке", "By card", "Theo thẻ")}>
                      {fromCard ? qtyText(line.planned_qty, unit) : T("добавлено", "added", "thêm")}
                    </td>
                    <td className="edit" data-label={T("Количество", "Quantity", "Số lượng")}>
                      {editable && line.product_id ? (
                        <QtyInput base={unit} value={line.qty} defaultSmall={unit !== "pcs" && line.qty > 0 && line.qty < 1} onChange={(v) => setLines((lines) => lines.map((item, i) => (i === index ? { ...item, qty: v ?? 0 } : item)))} />
                      ) : editable ? (
                        <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                      ) : (
                        qtyText(line.qty, unit)
                      )}
                    </td>
                    <td className="num" data-label={T("Есть на складе", "In stock", "Tồn kho")}>
                      {line.product_id ? <span className={short ? "erpBadge bad" : ""}>{qtyText(available, unit)}</span> : "—"}
                    </td>
                    {editable ? (
                      <td className="num">
                        <button type="button" className="erpIconBtn" aria-label={T("Убрать строку", "Remove line", "Xóa dòng")} onClick={() => setLines((lines) => lines.filter((_, i) => i !== index))}>
                          ×
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div className="erpActions">
            <button type="button" className="erpBtn" onClick={() => setLines((lines) => [...lines, { product_id: "", qty: 0, planned_qty: null }])}>
              + {T("Добавить", "Add", "Thêm")}
            </button>
          </div>
        ) : null}
      </section>

      {editable ? (
        <>
          {problems.length ? (
            <div className="erpNotice warn">
              <ul>
                {problems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="erpActions split">
            <div className="erpRow">
              <button type="button" className="erpBtn ghost" disabled={busy || (!dirty && Boolean(doc.id))} onClick={() => void saveDraft(T("Черновик сохранён", "Draft saved", "Đã lưu nháp"))}>
                {T("Сохранить черновик", "Save draft", "Lưu nháp")}
              </button>
              {doc.id ? (
                <button type="button" className="erpBtn ghost" disabled={busy} onClick={() => void remove()}>
                  {T("Удалить черновик", "Delete draft", "Xóa nháp")}
                </button>
              ) : null}
            </div>
            <button type="button" className="erpBtn primary" disabled={busy || problems.length > 0} onClick={() => void post()}>
              {busy ? savingText() : T("Сохранить", "Save", "Lưu")}
            </button>
          </div>
          <p className="erpHint">
            {T(
              "Остатки меняются только после сохранения (проведения) документа: исходные продукты списываются, полученный — приходуется.",
              "Stock moves only when the document is saved (posted): source products leave, the result is received.",
              "Tồn kho chỉ đổi khi lưu (ghi sổ): trừ nguyên liệu đầu, nhập thành phẩm.",
            )}
          </p>
        </>
      ) : (
        <>
          <div className="erpActions">
            <NavLink href={PROCESSING_NEW_HREF} className="erpBtn primary">
              {T("Добавить", "Add", "Thêm")}
            </NavLink>
            <NavLink href="/erp/stock" className="erpBtn">
              {T("Открыть остатки", "Open stock", "Xem tồn kho")}
            </NavLink>
            {doc.status === "posted" ? (
              <button type="button" className="erpBtn danger" disabled={busy} onClick={() => void cancelDoc()}>
                {T("Отменить переработку", "Cancel processing", "Hủy chế biến")}
              </button>
            ) : null}
          </div>
          <p className="erpHint">
            {T("Проводил", "Posted by", "Ghi sổ bởi")} {doc.posted_by ?? "—"} · {dateTimeText(doc.posted_at)}
            {doc.total_cost != null || doc.cost_known === false
              ? ` · ${T("себестоимость", "cost", "giá vốn")} ${doc.cost_known === false ? T("неполная", "incomplete", "chưa đủ") : vnd(doc.total_cost)}`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
