"use client";

import { useErpRouter } from "./erpHref";
import { useEffect, useState } from "react";
import { productTitle } from "@/lib/erp/costing";
import { initialWarehouses } from "@/lib/erp/docDefaults";
import { applyReceiptSupplier, inferredReceiptSupplier } from "@/lib/erp/docSupplier";
import { basePrice, compatiblePacks, defaultPackId, linePackName, packCoefficient, packDisplayName, packPrice, packToBase } from "@/lib/erp/packs";
import type { ErpDocType, ErpDocument, ErpDocumentLine, ErpState } from "@/lib/erp/types";
import { vietnamNowTime } from "@/lib/orders/datetime";
import { StatusBadge } from "./docs";
import { PurchasingReceiptPanel } from "./PurchasingReceiptPanel";
import { useErp } from "./ErpShell";
import { stockKindOf } from "./StockPage";
import {
  dateText,
  dateTimeText,
  docLabel,
  Empty,
  errorText,
  Field,
  loadingText,
  NavLink,
  numText,
  NumberInput,
  packText,
  PageHead,
  productById,
  ProductPicker,
  qtyText,
  QtyInput,
  savingText,
  stockQty,
  T,
  today,
  unitLabel,
  unitOf,
  useDirtyGuard,
  vnd,
  WarehouseSelect,
} from "./ui";

const TYPES = new Set<ErpDocType>(["opening", "receipt", "transfer", "writeoff", "count"]);

type SetDoc = <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => void;
type SetLines = (update: (lines: ErpDocumentLine[]) => ErpDocumentLine[]) => void;

/** randomUUID exists only on https and localhost; without it the busy-disabled buttons still guard. */
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null);

const nowTime = () => vietnamNowTime();

function defaultDocument(state: ErpState, type: ErpDocType, warehouse: string | null): ErpDocument {
  return {
    doc_type: type,
    doc_date: today(),
    ...(type === "writeoff" ? { doc_time: nowTime() } : {}),
    ...initialWarehouses(type, state.warehouses, warehouse),
    // A repeated save/post of this new document (double click, retry) returns the same document.
    client_key: newKey(),
    lines: [],
  };
}

/** A new write-off with the warehouse, reason, comment and lines of another one. */
function copyOf(state: ErpState, base: ErpDocument, source: ErpDocument): ErpDocument {
  const reason = state.writeoffReasons.find((r) => r.id === source.reason_id && !r.archived_at);
  const warehouse = state.warehouses.find((w) => w.id === source.warehouse_id && !w.archived_at);
  return {
    ...base,
    warehouse_id: warehouse?.id ?? base.warehouse_id,
    reason_id: reason?.id ?? null,
    comment: source.comment ?? null,
    lines: source.lines.map((line) => ({ product_id: line.product_id, qty: line.qty, pack_id: line.pack_id ?? null, pack_qty: line.pack_qty ?? null, reason: line.reason ?? null })),
  };
}

const newTitle = (type: ErpDocType) =>
  ({
    receipt: T("Принять поставку", "Receive a delivery", "Nhận hàng"),
    transfer: T("Переместить продукты", "Move products", "Chuyển hàng"),
    writeoff: T("Списать продукты", "Write off products", "Xuất hủy hàng"),
    count: T("Провести инвентаризацию", "Count stock", "Kiểm kê"),
    opening: T("Внести начальные остатки", "Enter opening balances", "Nhập tồn đầu kỳ"),
    production: T("Изготовить партию", "Make a batch", "Sản xuất mẻ"),
  })[type];

const postLabel = (type: ErpDocType) =>
  ({
    receipt: T("Принять поставку", "Receive delivery", "Nhận hàng"),
    transfer: T("Переместить", "Move", "Chuyển kho"),
    writeoff: T("Списать", "Write off", "Xuất hủy"),
    count: T("Завершить инвентаризацию", "Finish count", "Hoàn tất kiểm kê"),
    opening: T("Внести остатки", "Save balances", "Ghi tồn đầu kỳ"),
    production: T("Подтвердить производство", "Confirm production", "Xác nhận sản xuất"),
  })[type];

const postedText = (type: ErpDocType) =>
  ({
    receipt: T("Поставка принята", "Delivery received", "Đã nhận hàng"),
    transfer: T("Продукты перемещены", "Products moved", "Đã chuyển kho"),
    writeoff: T("Продукты списаны", "Products written off", "Đã xuất hủy"),
    count: T("Инвентаризация завершена", "Stock count finished", "Đã kiểm kê"),
    opening: T("Остатки внесены", "Balances saved", "Đã ghi tồn đầu kỳ"),
    production: T("Производство подтверждено", "Production confirmed", "Đã xác nhận sản xuất"),
  })[type];

type SavedDoc = { id: string; document?: ErpDocument | null };

async function fetchDoc(id: string): Promise<ErpDocument> {
  const response = await fetch(`/api/erp/documents/${id}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "server");
  return data.document as ErpDocument;
}

export function DocumentEditor({ id }: { id: string }) {
  const { state, act, busy } = useErp();
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
      const type = params.get("type") as ErpDocType;
      if (type === "production") {
        router.replace("/erp/menu/processing/new");
        return;
      }
      if (type === "count") {
        const warehouse = params.get("warehouse");
        router.replace(warehouse ? `/erp/stock/counts/new?warehouse=${encodeURIComponent(warehouse)}` : "/erp/stock/counts/new");
        return;
      }
      const initial = defaultDocument(state, TYPES.has(type) ? type : "receipt", params.get("warehouse"));
      if (initial.doc_type === "count" && initial.warehouse_id) initial.lines = countLines(state, initial.warehouse_id);
      const copy = params.get("copy");
      if (copy && initial.doc_type === "writeoff") {
        fetchDoc(copy)
          .then((source) => {
            const next = copyOf(state, initial, source);
            setDoc(next);
            setBaseline(JSON.stringify(initial));
          })
          .catch((error: Error) => setLoadError(errorText(error.message)));
        return;
      }
      loadSaved(initial);
      return;
    }
    fetchDoc(id)
      .then((saved) => {
        if (saved.doc_type === "production") router.replace(`/erp/menu/processing/${id}`);
        else if (saved.doc_type === "count") router.replace(`/erp/stock/counts/${id}`);
        else loadSaved(saved);
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
        title={T("Не удалось открыть документ", "Could not open the document", "Không mở được chứng từ")}
        text={loadError}
        action={
          <NavLink href="/erp/stock" className="erpBtn">
            {T("К складу", "Back to stock", "Về kho")}
          </NavLink>
        }
      />
    );
  }
  if (!state || !doc) return <div className="erpLoading">{loadingText()}</div>;

  const type = doc.doc_type;
  const set: SetDoc = (key, value) => setDoc((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setLines: SetLines = (update) => setDoc((prev) => (prev ? { ...prev, lines: update(prev.lines) } : prev));
  const kindHref = type === "production" ? "/erp/menu/processing" : `/erp/stock/${stockKindOf(type)}`;
  const backLabel =
    (
      {
        receipts: T("Поставки", "Deliveries", "Nhập hàng"),
        transfers: T("Перемещения", "Transfers", "Chuyển kho"),
        writeoffs: T("Списания", "Write-offs", "Xuất hủy"),
        processing: T("Переработки", "Processing", "Chế biến"),
        counts: T("Инвентаризации", "Stock counts", "Kiểm kê"),
      } as Record<string, string>
    )[stockKindOf(type)] ?? T("Склад", "Stock", "Kho");

  const usesStock = type === "transfer" || type === "writeoff";
  const shortages = usesStock ? doc.lines.filter((line) => line.product_id && stockQty(state, line.product_id, doc.warehouse_id) < line.qty) : [];
  const problems: string[] = [];
  if (!doc.warehouse_id) problems.push(T("Выберите склад", "Choose a location", "Chọn kho"));
  if (type === "transfer" && (!doc.target_warehouse_id || doc.target_warehouse_id === doc.warehouse_id))
    problems.push(T("Выберите другой склад назначения", "Choose a different destination", "Chọn kho đến khác"));
  if (!doc.lines.length) problems.push(T("Добавьте хотя бы один продукт", "Add at least one product", "Thêm ít nhất một sản phẩm"));
  if (doc.lines.some((line) => !line.product_id)) problems.push(T("В одной из строк не выбран продукт", "A line has no product", "Có dòng chưa chọn sản phẩm"));
  if (doc.lines.some((line) => line.product_id && (type === "count" ? line.qty < 0 : !(line.qty > 0))))
    problems.push(T("Укажите количество в каждой строке", "Enter a quantity on every line", "Nhập số lượng cho mỗi dòng"));
  if (
    type === "receipt" &&
    doc.lines.some((line) => {
      const pack = state.packs.find((p) => p.id === line.pack_id);
      const unit = unitOf(state, line.product_id);
      return Boolean(pack && unit && pack.unit !== unit);
    })
  )
    problems.push(T("Фасовка не совпадает с единицей товара", "The pack unit does not match the product", "Quy cách không khớp đơn vị hàng"));
  if (type === "receipt" && doc.lines.some((line) => line.pack_id && !(Number(line.pack_qty) > 0)))
    problems.push(T("Укажите количество фасовок больше нуля", "Enter a pack quantity greater than 0", "Nhập số quy cách lớn hơn 0"));
  if (shortages.length) problems.push(T("На складе не хватает части продуктов", "Some products are short", "Thiếu hàng trong kho"));

  /** Shows the document as the server saved it. */
  const showSaved = (saved: ErpDocument | null | undefined) => {
    if (!saved) return setBaseline(JSON.stringify(doc));
    if (!doc.id) window.history.replaceState(null, "", `/erp/documents/${saved.id}`);
    loadSaved(saved);
  };

  const payload = () => applyReceiptSupplier(state, doc) as unknown as Record<string, unknown>;

  const save = async (successText: string | false) => {
    const result = await act<SavedDoc>({ action: "saveDocument", document: payload() }, successText);
    if (result) showSaved(result.document);
  };

  const post = async () => {
    // One request saves the edits and posts; posting is shown only after the server confirms it.
    const result = await act<SavedDoc>(
      { action: "postDocument", id: doc.id, document: dirty || !doc.id ? payload() : undefined },
      postedText(type),
      { onFail: (data) => showSaved(data.document as ErpDocument | undefined) },
    );
    if (result) showSaved(result.document);
  };

  const cancel = async () => {
    const reason = window.prompt(T("Причина отмены документа", "Why is this document cancelled?", "Lý do hủy chứng từ"));
    if (!reason?.trim() || !doc.id) return;
    const result = await act<SavedDoc>({ action: "cancelDocument", id: doc.id, reason }, T("Документ отменён", "Document cancelled", "Đã hủy chứng từ"));
    if (result?.document) loadSaved(result.document);
  };

  const remove = async () => {
    if (!doc.id || !window.confirm(T("Удалить черновик?", "Delete this draft?", "Xóa bản nháp?"))) return;
    if (await act({ action: "deleteDraft", id: doc.id }, T("Черновик удалён", "Draft deleted", "Đã xóa bản nháp"))) {
      setBaseline(JSON.stringify(doc));
      router.push(kindHref);
    }
  };

  return (
    <>
      <NavLink href={kindHref} className="erpBack">
        ← {backLabel}
      </NavLink>
      <PageHead
        title={
          doc.status ? (
            <>
              {docLabel(type)} {doc.doc_no} <StatusBadge status={doc.status} />
            </>
          ) : (
            newTitle(type)
          )
        }
        sub={doc.status ? dateText(doc.doc_date) : undefined}
      />
      {type === "receipt" && doc.id ? <PurchasingReceiptPanel documentId={doc.id} /> : null}
      {doc.status === "cancelled" ? (
        <div className="erpNotice bad">
          {T("Документ отменён", "Cancelled", "Đã hủy")}: {doc.cancel_reason} · {doc.cancelled_by} · {dateTimeText(doc.cancelled_at)}
        </div>
      ) : null}

      <section className="erpCard">
        <Header state={state} doc={doc} editable={editable} set={set} setLines={setLines} />
      </section>

      <Lines state={state} doc={doc} editable={editable} set={set} setLines={setLines} />

      {editable ? (
        <>
          {problems.length && doc.lines.length ? (
            <div className="erpNotice warn">
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="erpActions split">
            <div className="erpRow">
              <button type="button" className="erpBtn ghost" disabled={busy || (!dirty && Boolean(doc.id))} onClick={() => save(T("Черновик сохранён", "Draft saved", "Đã lưu nháp"))}>
                {T("Сохранить черновик", "Save draft", "Lưu nháp")}
              </button>
              {doc.id ? (
                <button type="button" className="erpBtn ghost" disabled={busy} onClick={remove}>
                  {T("Удалить черновик", "Delete draft", "Xóa nháp")}
                </button>
              ) : null}
            </div>
            <button type="button" className="erpBtn primary" disabled={busy || problems.length > 0} onClick={post}>
              {busy ? savingText() : postLabel(type)}
            </button>
          </div>
          <p className="erpHint">
            {T(
              "Пока документ не подтверждён, остатки не меняются. Черновик можно сохранить и закончить позже.",
              "Stock does not change until you confirm. You can save a draft and finish later.",
              "Tồn kho chỉ thay đổi khi xác nhận. Có thể lưu nháp và hoàn tất sau.",
            )}
          </p>
        </>
      ) : (
        <>
          <div className="erpActions">
            <NavLink href={`/erp/documents/new?type=${type}`} className="erpBtn primary">
              {newTitle(type)}
            </NavLink>
            <NavLink href="/erp/stock" className="erpBtn">
              {T("Открыть остатки", "Open stock", "Xem tồn kho")}
            </NavLink>
            {doc.status === "posted" ? (
              <button type="button" className="erpBtn danger" disabled={busy} onClick={cancel}>
                {T("Отменить документ", "Cancel document", "Hủy chứng từ")}
              </button>
            ) : null}
          </div>
          <p className="erpHint">
            {T("Подтвердил", "Confirmed by", "Xác nhận bởi")} {doc.posted_by ?? "—"} · {dateTimeText(doc.posted_at)} · {T("создал", "created by", "tạo bởi")} {doc.created_by ?? "—"}
          </p>
        </>
      )}
    </>
  );
}

function countLines(state: ErpState, warehouseId: string): ErpDocumentLine[] {
  return state.stock
    .filter((row) => row.warehouse_id === warehouseId && row.qty !== 0 && state.products.some((p) => p.id === row.product_id && !p.archived_at))
    .sort((a, b) => (productById(state, a.product_id)?.name_en ?? "").localeCompare(productById(state, b.product_id)?.name_en ?? ""))
    .map((row) => ({ product_id: row.product_id, qty: row.qty }));
}

function Header({ state, doc, editable, set, setLines }: { state: ErpState; doc: ErpDocument; editable: boolean; set: SetDoc; setLines: SetLines }) {
  const { email } = useErp();
  const type = doc.doc_type;
  const warehouseLabel =
    type === "receipt"
      ? T("Куда принять *", "Receive into *", "Nhập vào kho *")
      : type === "transfer"
        ? T("Откуда *", "From *", "Từ kho *")
        : type === "count"
          ? T("Какой склад считаем *", "Location to count *", "Kho kiểm kê *")
          : T("Склад *", "Location *", "Kho *");
  const hasPrep = state.warehouses.some((w) => w.kind === "prep_kitchen" && !w.archived_at);
  const receiptHint =
    type !== "receipt" || !editable
      ? undefined
      : hasPrep
        ? T("По умолчанию поставка идёт на кухню заготовок (Prep Kitchen)", "Deliveries go to the prep kitchen by default", "Mặc định nhập vào bếp sơ chế")
        : T("Кухня заготовок не найдена — выберите склад вручную", "No prep kitchen found — choose a location", "Không có bếp sơ chế — hãy chọn kho");
  return (
    <div className="erpGrid two">
      {type === "receipt" && editable && !doc.warehouse_id ? (
        <div className="erpNotice warn" style={{ gridColumn: "1 / -1" }} data-testid="receipt-no-warehouse">
          {hasPrep
            ? T("Выберите склад, куда принять поставку.", "Choose where to receive the delivery.", "Chọn kho nhận hàng.")
            : T(
                "Активной кухни заготовок (Prep Kitchen) нет. Выберите склад, куда принять поставку.",
                "There is no active prep kitchen. Choose where to receive the delivery.",
                "Không có bếp sơ chế đang hoạt động. Hãy chọn kho nhận hàng.",
              )}
        </div>
      ) : null}
      <Field label={warehouseLabel} hint={receiptHint}>
        <WarehouseSelect
          warehouses={state.warehouses}
          value={doc.warehouse_id}
          disabled={!editable}
          onChange={(v) => {
            set("warehouse_id", v || null);
            if (type === "count" && v && !doc.lines.length) setLines(() => countLines(state, v));
          }}
        />
      </Field>
      {type === "transfer" ? (
        <Field label={T("Куда *", "To *", "Đến kho *")}>
          <WarehouseSelect warehouses={state.warehouses} value={doc.target_warehouse_id} disabled={!editable} onChange={(v) => set("target_warehouse_id", v || null)} />
        </Field>
      ) : null}
      {type === "receipt" ? (
        <Field label={T("Поставщик", "Supplier", "Nhà cung cấp")}>
          <select value={doc.supplier_id ?? ""} disabled={!editable} onChange={(e) => set("supplier_id", e.target.value || null)}>
            <option value="">{T("— не указан —", "— not set —", "— không —")}</option>
            {state.suppliers
              .filter((s) => !s.archived_at || s.id === doc.supplier_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      {type === "writeoff" ? (
        <Field
          label={T("Причина", "Reason", "Lý do")}
          hint={
            doc.reason && !doc.reason_id
              ? `${T("Причина, введённая раньше текстом", "Reason typed earlier", "Lý do nhập trước đây")}: ${doc.reason}`
              : editable && !state.writeoffReasons.some((r) => !r.archived_at)
                ? T("Причин пока нет — их можно добавить во вкладке «Причины»", "No reasons yet — add them on the Reasons tab", "Chưa có lý do — thêm ở tab Lý do")
                : undefined
          }
        >
          <select value={doc.reason_id ?? ""} disabled={!editable} onChange={(e) => set("reason_id", e.target.value || null)} data-testid="wo-reason-select">
            <option value="">{T("Без причины", "No reason", "Không có lý do")}</option>
            {state.writeoffReasons
              .filter((r) => !r.archived_at || r.id === doc.reason_id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.archived_at ? ` (${T("архив", "archived", "lưu trữ")})` : ""}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      {type === "writeoff" ? (
        <Field label={T("Дата и время списания", "Write-off date and time", "Ngày giờ xuất hủy")}>
          <span className="erpRow">
            <input type="date" value={doc.doc_date ?? ""} disabled={!editable} onChange={(e) => set("doc_date", e.target.value)} />
            <input type="time" value={doc.doc_time?.slice(0, 5) ?? ""} disabled={!editable} onChange={(e) => set("doc_time", e.target.value || null)} aria-label={T("Время", "Time", "Giờ")} />
          </span>
        </Field>
      ) : (
        <Field label={T("Дата", "Date", "Ngày")}>
          <input type="date" value={doc.doc_date ?? ""} disabled={!editable} onChange={(e) => set("doc_date", e.target.value)} />
        </Field>
      )}
      {type === "writeoff" ? (
        <Field label={T("Сотрудник", "Employee", "Nhân viên")} hint={T("Определяется по входу в ERP", "Taken from the signed-in user", "Theo người đăng nhập")}>
          <input value={doc.created_by ?? email} disabled readOnly />
        </Field>
      ) : null}
      {type === "receipt" && state.settings.input_vat_enabled ? (
        <label className="erpCheck">
          <input type="checkbox" checked={Boolean(doc.prices_include_vat)} disabled={!editable} onChange={(e) => set("prices_include_vat", e.target.checked)} />
          {T("Цены указаны с НДС", "Prices include VAT", "Giá đã gồm VAT")}
        </label>
      ) : null}
      <Field label={T("Комментарий", "Comment", "Ghi chú")} wide>
        <input value={doc.comment ?? ""} disabled={!editable} onChange={(e) => set("comment", e.target.value)} />
      </Field>
    </div>
  );
}

function Lines({ state, doc, editable, set, setLines }: { state: ErpState; doc: ErpDocument; editable: boolean; set: SetDoc; setLines: SetLines }) {
  const type = doc.doc_type;
  const priced = type === "receipt" || type === "opening";
  const vatOn = type === "receipt" && state.settings.input_vat_enabled;
  const posted = doc.status === "posted" || doc.status === "cancelled";
  const showStock = type === "transfer" || type === "writeoff" || (type === "count" && !posted);
  const withPacks = type === "receipt" || type === "writeoff";
  const takeSupplier = (lines: ErpDocumentLine[]) => {
    const id = inferredReceiptSupplier(state, { ...doc, lines });
    if (id) set("supplier_id", id);
  };
  const update = (index: number, patch: Partial<ErpDocumentLine>) =>
    setLines((lines) => {
      const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line));
      takeSupplier(next);
      return next;
    });
  const total = doc.lines.reduce((sum, line) => sum + (line.unit_price ?? 0) * line.qty, 0);
  const missingPrice = priced && doc.lines.some((line) => line.product_id && (line.unit_price === null || line.unit_price === undefined));
  const qtyLabel = type === "count" ? T("Фактически", "Counted", "Thực tế") : type === "receipt" ? T("Принято", "Received", "Đã nhận") : T("Количество", "Quantity", "Số lượng");
  const stockLabel = type === "count" ? T("По учёту", "On record", "Theo sổ") : T("Есть на складе", "In stock", "Tồn kho");

  return (
    <section className="erpCard">
      <h2>{T("Продукты", "Products", "Sản phẩm")}</h2>
      {!doc.lines.length ? (
        <p className="erpHint">
          {type === "count"
            ? T("На выбранном складе нет остатков. Добавьте продукты, которые нашли при пересчёте.", "No stock on record here. Add what you find on the shelf.", "Kho chưa có tồn. Thêm hàng tìm thấy khi đếm.")
            : T("Добавьте продукты кнопкой ниже.", "Add products with the button below.", "Thêm sản phẩm bằng nút bên dưới.")}
        </p>
      ) : (
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                {withPacks ? <th>{T("Фасовка", "Pack", "Quy cách")}</th> : null}
                <th>{qtyLabel}</th>
                {showStock ? <th className="num">{stockLabel}</th> : null}
                {type === "count" ? <th className="num">{T("Разница", "Difference", "Chênh lệch")}</th> : null}
                {priced ? <th>{T("Цена за фасовку, ₫", "Pack price, ₫", "Giá quy cách, ₫")}</th> : null}
                {vatOn ? <th>{T("НДС, %", "VAT, %", "VAT, %")}</th> : null}
                {priced ? <th>{T("Годен до", "Use by", "Hạn dùng")}</th> : null}
                {type === "writeoff" ? <th>{T("Комментарий", "Note", "Ghi chú")}</th> : null}
                {priced || posted ? <th className="num">{T("Сумма", "Amount", "Số tiền")}</th> : null}
                {editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, index) => {
                const product = productById(state, line.product_id);
                const unit = unitOf(state, line.product_id);
                const packs = compatiblePacks(state.packs, unit);
                const pack = state.packs.find((p) => p.id === line.pack_id) ?? null;
                const coef = packCoefficient(line, pack);
                const packLabel = linePackName(line, state.packs) || (pack ? pack.name : "");
                const onePackPrice = pack && coef && line.unit_price != null ? packPrice(line.unit_price, coef) : null;
                const available = stockQty(state, line.product_id, doc.warehouse_id);
                const short = type !== "count" && showStock && Boolean(line.product_id) && available < line.qty;
                const recorded = posted ? (line.system_qty ?? null) : available;
                const diff = type === "count" ? (posted ? (line.diff_qty ?? null) : line.product_id ? line.qty - available : null) : null;
                return (
                  <tr key={line.id ?? index} className={short ? "short" : ""}>
                    <td className="main" style={{ minWidth: 220 }}>
                      {editable ? (
                        <ProductPicker
                          state={state}
                          value={line.product_id}
                          onChange={(productId) => {
                            const picked = productById(state, productId);
                            const defaultId = type === "receipt" ? defaultPackId(state.productPacks, productId) : null;
                            update(index, {
                              product_id: productId,
                              pack_id: defaultId,
                              pack_qty: null,
                              unit_price: priced ? (picked?.est_unit_cost ?? null) : null,
                            });
                          }}
                        />
                      ) : (
                        <span className="erpName">{product ? productTitle(product) : "—"}</span>
                      )}
                      {editable && product?.brand ? (
                        <small className="erpCellSub">
                          {T("Бренд", "Brand", "Thương hiệu")}: {product.brand}
                        </small>
                      ) : null}
                      {short ? (
                        <span className="erpShort">
                          {T("Не хватает", "Short by", "Thiếu")} {qtyText(line.qty - available, unit)}
                        </span>
                      ) : null}
                    </td>
                    {withPacks ? (
                      <td className="edit" data-label={T("Фасовка", "Pack", "Quy cách")}>
                        {editable ? (
                          line.product_id ? (
                            <div className="erpPackLine">
                              <select
                                value={line.pack_id ?? ""}
                                onChange={(e) => {
                                  const next = e.target.value || null;
                                  const chosen = packs.find((p) => p.id === next);
                                  if (next && chosen && unit && chosen.unit !== unit) return;
                                  update(index, {
                                    pack_id: next,
                                    pack_qty: next ? line.pack_qty : null,
                                    qty: next && chosen && line.pack_qty ? packToBase(line.pack_qty, chosen.qty_base) : line.qty,
                                  });
                                }}
                                aria-label={T("Фасовка", "Pack", "Quy cách")}
                                data-testid="doc-pack"
                              >
                                <option value="">{T("без фасовки", "no pack", "không")}</option>
                                {packs.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {packDisplayName(p)} = {qtyText(p.qty_base, unit)}
                                  </option>
                                ))}
                              </select>
                              {pack && coef ? (
                                <label className="erpPackQty" data-testid="doc-pack-qty">
                                  <span>{T("Количество фасовок", "Number of packs", "Số quy cách")}</span>
                                  <NumberInput
                                    value={line.pack_qty}
                                    onChange={(v) =>
                                      update(index, {
                                        pack_qty: v,
                                        qty: v === null ? line.qty : packToBase(v, coef),
                                      })
                                    }
                                  />
                                </label>
                              ) : null}
                              {pack && coef && line.pack_qty ? (
                                <small className="erpCellSub" data-testid="doc-pack-qty-base">
                                  {qtyText(packToBase(line.pack_qty, coef), unit)}
                                </small>
                              ) : null}
                            </div>
                          ) : (
                            <span className="erpMuted">—</span>
                          )
                        ) : line.pack_id && line.pack_qty ? (
                          `${numText(line.pack_qty)} × ${packText(packLabel)} = ${qtyText(line.qty, unit)}`
                        ) : (
                          "—"
                        )}
                      </td>
                    ) : null}
                    <td className="edit" data-label={qtyLabel}>
                      {editable ? (
                        line.product_id ? (
                          <QtyInput base={unit} value={line.qty} defaultSmall={unit !== "pcs" && line.qty > 0 && line.qty < 1} onChange={(v) => update(index, { qty: v ?? 0, pack_qty: null })} />
                        ) : (
                          <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                        )
                      ) : (
                        qtyText(line.qty, unit)
                      )}
                    </td>
                    {showStock ? (
                      <td className="num" data-label={stockLabel}>
                        {line.product_id ? <span className={short ? "erpBadge bad" : ""}>{qtyText(recorded, unit)}</span> : "—"}
                      </td>
                    ) : null}
                    {type === "count" ? (
                      <td className="num" data-label={T("Разница", "Difference", "Chênh lệch")}>
                        {diff === null ? "—" : diff === 0 ? <span className="erpMuted">0</span> : <span className={`erpBadge ${diff < 0 ? "bad" : "ok"}`}>{`${diff > 0 ? "+" : "−"}${qtyText(Math.abs(diff), unit)}`}</span>}
                      </td>
                    ) : null}
                    {priced ? (
                      <td className="edit" data-label={pack && coef ? T("Цена за фасовку, ₫", "Pack price, ₫", "Giá quy cách, ₫") : T("Цена за единицу, ₫", "Unit price, ₫", "Đơn giá, ₫")}>
                        {editable ? (
                          pack && coef ? (
                            <span data-testid="doc-pack-price">
                              <NumberInput
                                value={onePackPrice}
                                placeholder={T("Цена за фасовку", "Price per pack", "Giá một quy cách")}
                                onChange={(v) => update(index, { unit_price: v === null ? null : basePrice(v, coef) })}
                              />
                              {line.pack_qty && onePackPrice != null ? (
                                <small className="erpCellSub" data-testid="doc-pack-price-hint">
                                  {vnd(onePackPrice * line.pack_qty)}
                                  {unit ? ` · ${vnd(basePrice(onePackPrice, coef))} / ${unitLabel(unit)}` : ""}
                                </small>
                              ) : null}
                            </span>
                          ) : (
                            <NumberInput value={line.unit_price} placeholder={unit ? `₫ / ${unitLabel(unit)}` : ""} onChange={(v) => update(index, { unit_price: v })} />
                          )
                        ) : pack && coef && line.pack_qty ? (
                          `${vnd(onePackPrice)} / ${T("фасовку", "pack", "quy cách")}`
                        ) : (
                          `${vnd(line.unit_price)}${unit ? ` / ${unitLabel(unit)}` : ""}`
                        )}
                      </td>
                    ) : null}
                    {vatOn ? (
                      <td className="edit" data-label={T("НДС, %", "VAT, %", "VAT, %")} style={{ width: 90 }}>
                        {editable ? (
                          <NumberInput value={line.vat_rate} placeholder={String(state.settings.default_input_vat_rate ?? "")} onChange={(v) => update(index, { vat_rate: v })} />
                        ) : (
                          (line.vat_rate ?? state.settings.default_input_vat_rate ?? "—")
                        )}
                      </td>
                    ) : null}
                    {priced ? (
                      <td className="edit" data-label={T("Годен до", "Use by", "Hạn dùng")}>
                        {editable ? <input type="date" value={line.expires_at ?? ""} onChange={(e) => update(index, { expires_at: e.target.value || null })} /> : dateText(line.expires_at)}
                      </td>
                    ) : null}
                    {type === "writeoff" ? (
                      <td className="edit" data-label={T("Комментарий", "Note", "Ghi chú")}>
                        {editable ? <input value={line.reason ?? ""} onChange={(e) => update(index, { reason: e.target.value })} /> : (line.reason ?? "—")}
                      </td>
                    ) : null}
                    {priced || posted ? (
                      <td className="num" data-label={T("Сумма", "Amount", "Số tiền")}>
                        {posted ? (
                          line.cost_known === false ? (
                            <span className="erpBadge warn">{T("цена неизвестна", "price unknown", "chưa rõ giá")}</span>
                          ) : (
                            <>
                              {vnd(line.cost_amount)}
                              {type === "writeoff" && line.unit_cost !== null && line.unit_cost !== undefined ? (
                                <small className="erpCellSub">
                                  {vnd(line.unit_cost)} / {unitLabel(unit)}
                                </small>
                              ) : null}
                            </>
                          )
                        ) : line.unit_price !== null && line.unit_price !== undefined ? (
                          <span data-testid="doc-line-sum">{vnd(line.unit_price * line.qty)}</span>
                        ) : (
                          "—"
                        )}
                        {posted && vatOn && line.vat_amount ? <small className="erpCellSub">НДС {vnd(line.vat_amount)}</small> : null}
                      </td>
                    ) : null}
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
      )}
      {editable ? (
        <div className="erpActions">
          <button type="button" className="erpBtn" data-testid="doc-add-line" onClick={() => setLines((lines) => [...lines, { product_id: "", qty: 0 }])}>
            + {T("Добавить продукт", "Add product", "Thêm sản phẩm")}
          </button>
          {type === "count" && doc.warehouse_id ? (
            <button
              type="button"
              className="erpBtn ghost"
              onClick={() => {
                if (!doc.lines.length || window.confirm(T("Заменить список всеми остатками склада?", "Replace the list with all stock at this location?", "Thay danh sách bằng toàn bộ tồn kho?"))) {
                  setLines(() => countLines(state, doc.warehouse_id!));
                }
              }}
            >
              {T("Заполнить по остаткам склада", "Fill from stock on record", "Điền theo tồn kho")}
            </button>
          ) : null}
        </div>
      ) : null}
      {priced && doc.lines.length ? (
        <p className="erpHint">
          {T("Итого", "Total", "Tổng")}: <b>{vnd(total)}</b>
          {missingPrice ? ` · ${T("у строк без цены себестоимость будет неизвестна", "lines without a price will have unknown cost", "dòng chưa có giá sẽ chưa rõ giá vốn")}` : ""}
          {vatOn ? ` · ${doc.prices_include_vat ? T("с НДС", "incl. VAT", "gồm VAT") : T("без НДС", "excl. VAT", "chưa VAT")}` : ""}
        </p>
      ) : null}
      {type === "count" && !posted && doc.lines.length ? (
        <p className="erpHint">{T("После завершения остатки станут равны фактическим, разница будет записана в документ.", "After finishing, stock equals the counted amounts; the difference is recorded.", "Sau khi hoàn tất, tồn kho sẽ bằng số thực tế.")}</p>
      ) : null}
      {posted && type !== "count" ? (
        <p className="erpHint">
          {T("Себестоимость документа", "Document cost", "Giá vốn chứng từ")}: <b>{doc.cost_known ? vnd(doc.total_cost) : T("неполная — часть цен неизвестна", "incomplete — some prices unknown", "chưa đủ — thiếu giá")}</b>
        </p>
      ) : null}
    </section>
  );
}
