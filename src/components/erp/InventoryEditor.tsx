"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { productTitle } from "@/lib/erp/costing";
import { compatiblePacks, packToBase } from "@/lib/erp/packs";
import {
  clearLocalDraft,
  countFromDocument,
  documentFromCount,
  fallbackCountLines,
  fetchCountDoc,
  mergeDraft,
  postCountViaApi,
  previewCountViaApi,
  saveCountViaApi,
  nowDateTimeLocal,
  readLocalDraft,
  writeLocalDraft,
  type CountDoc,
  type CountLine,
  type CountMode,
  type CountWhen,
} from "@/lib/erp/inventoryUi";
import type { ErpDocument } from "@/lib/erp/types";
import { StatusBadge } from "./docs";
import { useErp } from "./ErpShell";
import {
  dateTimeText,
  Empty,
  errorText,
  Field,
  loadingText,
  NavLink,
  NumberInput,
  packText,
  PageHead,
  productById,
  qtyText,
  QtyInput,
  T,
  unitOf,
  useDirtyGuard,
  vnd,
  WarehouseSelect,
} from "./ui";

type SavedDoc = { id: string; document?: ErpDocument | null };
type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

const countHref = (id: string) => `/erp/stock/counts/${id}`;

function emptyDoc(warehouse: string | null): CountDoc {
  return {
    warehouse_id: warehouse,
    mode: "full",
    when: "now",
    counted_at: nowDateTimeLocal(),
    period_start: null,
    product_ids: [],
    category_ids: [],
    status: "draft",
    result_amount: null,
    result_known: true,
    comment: "",
    lines: [],
    idle: [],
    logic: "documents-fallback",
    postingReady: false,
    periodReady: false,
  };
}

export function InventoryEditor({ id }: { id: string }) {
  const { state, act, busy } = useErp();
  const router = useRouter();
  const [doc, setDoc] = useState<CountDoc | null>(null);
  const [step, setStep] = useState<"form" | "table">(id === "new" ? "form" : "table");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openedAt] = useState(() => performance.now());
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [saveMs, setSaveMs] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const openedLogged = useRef(false);

  useEffect(() => {
    if (!state) return;
    if (id === "new") {
      const warehouse = new URLSearchParams(window.location.search).get("warehouse");
      const local = readLocalDraft("new");
      setDoc(local?.doc ?? emptyDoc(warehouse));
      return;
    }
    const started = performance.now();
    fetchCountDoc(id)
      .then((saved) => {
        const merged = mergeDraft(saved, readLocalDraft(id));
        if (!merged.lines.length && merged.warehouse_id && merged.status === "draft" && !merged.periodReady && merged.mode === "partial") {
          merged.lines = fallbackCountLines(state, merged.warehouse_id, merged.mode, merged.product_ids, merged.category_ids);
        }
        setDoc(merged);
        setStep("table");
        if (!openedLogged.current) {
          openedLogged.current = true;
          setOpenMs(Math.round(performance.now() - started));
        }
      })
      .catch((error: Error) => setLoadError(errorText(error.message)));
  }, [id, Boolean(state)]);

  const editable = Boolean(doc) && (!doc?.status || doc.status === "draft" || doc.status === "editing");
  const dirty = Boolean(doc) && editable;
  useDirtyGuard(dirty && saveState !== "saved");

  useEffect(() => {
    if (!doc || !editable) return;
    writeLocalDraft(doc.id ?? "new", doc);
  }, [doc, editable]);

  if (loadError) {
    return (
      <Empty
        kind="error"
        title={T("Не удалось открыть инвентаризацию", "Could not open the stock count", "Không mở được kiểm kê")}
        text={loadError}
        action={
          <NavLink href="/erp/stock/counts" className="erpBtn">
            {T("К списку", "Back to list", "Về danh sách")}
          </NavLink>
        }
      />
    );
  }
  if (!state || !doc) return <div className="erpLoading">{loadingText()}</div>;

  const persistDraft = async (next: CountDoc, silent = true) => {
    setSaveState("saving");
    setSaveError(null);
    const started = performance.now();
    try {
      const viaApi = await saveCountViaApi(next);
      const result = viaApi
        ? { id: viaApi.id, document: viaApi.document ?? viaApi.count }
        : await act<SavedDoc>({ action: "saveDocument", document: documentFromCount(next) }, silent ? false : T("Черновик сохранён", "Draft saved", "Đã lưu nháp"));
      if (!result) {
        setSaveState(navigator.onLine ? "error" : "offline");
        setSaveError(T("Сервер не подтвердил сохранение", "The server did not confirm the save", "Máy chủ chưa xác nhận lưu"));
        return null;
      }
      const saved = result.document
        ? countFromDocument(result.document, viaApi ? "counts-api" : next.logic, Boolean(viaApi) || next.postingReady, Boolean(viaApi) || next.periodReady)
        : { ...next, id: result.id, postingReady: Boolean(viaApi) || next.postingReady, periodReady: Boolean(viaApi) || next.periodReady };
      if (!next.id && saved.id) {
        writeLocalDraft(saved.id, { ...next, ...saved, lines: next.lines });
        clearLocalDraft("new");
        window.history.replaceState(null, "", countHref(saved.id));
      }
      setDoc((prev) => (prev ? { ...prev, ...saved, lines: prev.lines } : saved));
      setSaveState("saved");
      setSaveMs(Math.round(performance.now() - started));
      return saved;
    } catch (e) {
      setSaveState(navigator.onLine ? "error" : "offline");
      setSaveError(errorText(e instanceof Error ? e.message : "network"));
      return null;
    }
  };

  const scheduleSave = (next: CountDoc) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persistDraft(next, true);
    }, 800);
  };

  const setLine = (productId: string, patch: Partial<CountLine>) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = { ...prev, lines: prev.lines.map((line) => (line.product_id === productId ? { ...line, ...patch } : line)) };
      scheduleSave(next);
      return next;
    });
  };

  const uncounted = doc.lines.filter((line) => line.fact_qty === null);

  const postCount = async () => {
    if (!doc.postingReady) return;
    if (uncounted.length) return;
    setSaveState("saving");
    try {
      const viaApi = await postCountViaApi(doc);
      if (!viaApi) {
        setSaveState("error");
        setSaveError(T("Проведение ждёт /api/erp/counts. Успех не показываем.", "Posting waits for /api/erp/counts. Success is not shown.", "Ghi sổ chờ /api/erp/counts."));
        return;
      }
      const raw = viaApi.count ?? viaApi.document;
      if (raw) setDoc(countFromDocument(raw, "counts-api", true, true));
      setSaveState("saved");
      clearLocalDraft(doc.id ?? "new");
    } catch (e) {
      setSaveState("error");
      setSaveError(errorText(e instanceof Error ? e.message : "network"));
    }
  };

  const create = async () => {
    if (!doc.warehouse_id) return;
    let lines: CountLine[] = [];
    let idle = doc.idle;
    let periodReady = false;
    let postingReady = false;
    let logic: CountDoc["logic"] = "documents-fallback";
    try {
      const preview = await previewCountViaApi(doc);
      if (preview) {
        const previewed = countFromDocument(
          { ...preview, warehouse_id: doc.warehouse_id, comment: doc.comment, status: "draft", count_kind: doc.mode },
          "counts-api",
          true,
          true,
        );
        lines = previewed.lines;
        idle = previewed.idle;
        periodReady = true;
        postingReady = true;
        logic = "counts-api";
      } else {
        lines = fallbackCountLines(state, doc.warehouse_id, doc.mode, doc.product_ids, doc.category_ids);
      }
    } catch {
      lines = fallbackCountLines(state, doc.warehouse_id, doc.mode, doc.product_ids, doc.category_ids);
    }
    const next = { ...doc, lines, idle, periodReady, postingReady, logic };
    const saved = await persistDraft(next, false);
    if (!saved?.id) return;
    setDoc({ ...next, ...saved, lines, idle, periodReady, postingReady, logic });
    setStep("table");
    router.replace(countHref(saved.id));
  };

  const problems: string[] = [];
  if (!doc.warehouse_id) problems.push(T("Выберите склад", "Choose a location", "Chọn kho"));
  if (doc.mode === "partial" && !doc.product_ids.length && !doc.category_ids.length) {
    problems.push(T("Выберите продукты или категории для частичной проверки", "Choose products or categories for a partial count", "Chọn sản phẩm hoặc nhóm cho kiểm kê một phần"));
  }
  if (doc.when === "backdated" && !doc.counted_at) problems.push(T("Укажите дату и время проверки", "Enter the count date and time", "Nhập ngày giờ kiểm kê"));

  const saveLabel =
    saveState === "saving"
      ? T("Сохраняем…", "Saving…", "Đang lưu…")
      : saveState === "saved"
        ? T("Сохранено", "Saved", "Đã lưu")
        : saveState === "offline"
          ? T("Нет связи — значения остаются на этом устройстве", "Offline — values stay on this device", "Mất mạng — giữ trên máy này")
          : saveState === "error"
            ? T("Не сохранено на сервере", "Not saved on the server", "Chưa lưu trên máy chủ")
            : T("Черновик", "Draft", "Nháp");

  return (
    <div className="erpInv">
      <PageHead
        title={id === "new" && step === "form" ? T("Добавление инвентаризации", "New stock count", "Thêm kiểm kê") : T("Инвентаризация", "Stock count", "Kiểm kê")}
        actions={
          <div className="erpHeadActions">
            <span className={`erpInvSave erpInvSave-${saveState}`} data-testid="inventory-save-state">
              {saveLabel}
              {saveMs !== null && saveState === "saved" ? ` · ${saveMs} ${T("мс", "ms", "ms")}` : ""}
            </span>
            <NavLink href="/erp/stock/counts" className="erpBtn">
              {T("К списку", "Back to list", "Về danh sách")}
            </NavLink>
          </div>
        }
      />
      {saveError ? <p className="erpNotice warn">{saveError}</p> : null}
      {step === "form" ? (
        <CreateForm
          doc={doc}
          setDoc={setDoc}
          problems={problems}
          busy={busy || saveState === "saving"}
          onSave={() => void create()}
        />
      ) : (
        <CountTable
          doc={doc}
          setLine={setLine}
          persist={() => void persistDraft(doc, false)}
          post={() => void postCount()}
          uncounted={uncounted.length}
          editable={editable}
          openMs={openMs ?? Math.round(performance.now() - openedAt)}
        />
      )}
    </div>
  );
}

function EligibleHint({
  doc,
  eligibleCount,
  idleCount,
}: {
  doc: CountDoc;
  eligibleCount: number | null;
  idleCount: number;
}) {
  if (doc.mode === "full") {
    return (
      <p className="erpHint" data-testid="inventory-scope-hint">
        {T(
          "В полную проверку входят только позиции с движением за свой период. Остаток без движения в корректировку не попадает.",
          "A full count includes only items with movement in their own period. Leftover without movement is not adjusted.",
          "Kiểm toàn bộ chỉ gồm hàng có phát sinh trong kỳ của nó. Tồn không phát sinh không điều chỉnh.",
        )}
        {eligibleCount !== null
          ? ` ${T(`С движением: ${eligibleCount}. Без движения: ${idleCount}.`, `With movement: ${eligibleCount}. Without movement: ${idleCount}.`, `Có phát sinh: ${eligibleCount}. Không phát sinh: ${idleCount}.`)}`
          : ""}
      </p>
    );
  }
  return (
    <p className="erpHint" data-testid="inventory-scope-hint">
      {T(
        "Отметьте категории или продукты среди позиций с движением за период. Позиции разных брендов не смешиваются — у каждой свой ID. Без движения в корректировку не входят.",
        "Tick categories or products among items with movement in the period. Different brands stay separate — each has its own ID. Leftover without movement is not adjusted.",
        "Chọn nhóm hoặc sản phẩm trong hàng có phát sinh. Mỗi thương hiệu là một ID riêng. Không phát sinh thì không điều chỉnh.",
      )}
    </p>
  );
}

function CreateForm({
  doc,
  setDoc,
  problems,
  busy,
  onSave,
}: {
  doc: CountDoc;
  setDoc: (doc: CountDoc) => void;
  problems: string[];
  busy: boolean;
  onSave: () => void;
}) {
  const { state } = useErp();
  const [query, setQuery] = useState("");
  const [eligibleIds, setEligibleIds] = useState<string[] | null>(null);
  const [idleCount, setIdleCount] = useState(0);
  useEffect(() => {
    if (!doc.warehouse_id) {
      setEligibleIds(null);
      setIdleCount(0);
      return;
    }
    let cancelled = false;
    previewCountViaApi({ ...doc, mode: "full", product_ids: [], category_ids: [] }, "full")
      .then((preview) => {
        if (cancelled) return;
        if (!preview) {
          setEligibleIds(null);
          return;
        }
        setEligibleIds((preview.lines ?? []).map((line) => line.product_id));
        setIdleCount(preview.idle?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setEligibleIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.warehouse_id, doc.counted_at, doc.when]);
  if (!state) return null;
  const set = (patch: Partial<CountDoc>) => setDoc({ ...doc, ...patch });
  const q = query.trim().toLowerCase();
  const eligible = eligibleIds ? new Set(eligibleIds) : null;
  const products = state.products.filter(
    (p) =>
      !p.archived_at &&
      p.base_unit &&
      (!eligible || eligible.has(p.id)) &&
      (!q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code}`.toLowerCase().includes(q)),
  );
  const productCats = new Set(products.map((p) => p.category_id).filter(Boolean) as string[]);
  const categories = state.categories.filter(
    (c) => !c.archived_at && (!eligible || productCats.has(c.id) || doc.category_ids.includes(c.id)) && (!q || `${c.name_en} ${c.name_vn}`.toLowerCase().includes(q)),
  );
  const locked = !doc.warehouse_id;

  return (
    <section className="erpCard erpInvForm">
      <Field label={T("Склад", "Location", "Kho")}>
        <span data-testid="inventory-warehouse">
          <WarehouseSelect warehouses={state.warehouses} value={doc.warehouse_id} onChange={(v) => set({ warehouse_id: v || null })} />
        </span>
      </Field>
      <p className="erpHint">{T("Выберите склад, на котором хотите проверить остатки продуктов.", "Choose the location whose stock you want to count.", "Chọn kho cần kiểm tồn.")}</p>

      <div className={`erpInvSeg ${locked ? "off" : ""}`}>
        <span>{T("Проверка остатков", "Count time", "Thời điểm kiểm")}</span>
        <div className="erpInvSegBtns">
          <button type="button" className={doc.when === "backdated" ? "on" : ""} disabled={locked} onClick={() => set({ when: "backdated" as CountWhen })}>
            {T("Задним числом", "Backdated", "Lùi ngày")}
          </button>
          <button type="button" className={doc.when === "now" ? "on" : ""} disabled={locked} onClick={() => set({ when: "now" as CountWhen, counted_at: nowDateTimeLocal() })}>
            {T("Временем проведения", "At posting time", "Lúc ghi sổ")}
          </button>
        </div>
      </div>
      {doc.when === "backdated" ? (
        <Field label={T("Дата и время фактических остатков", "Date and time of the counted stock", "Ngày giờ tồn thực tế")}>
          <input type="datetime-local" value={doc.counted_at} disabled={locked} onChange={(e) => set({ counted_at: e.target.value })} />
        </Field>
      ) : (
        <p className="erpHint">
          {T(
            "Плановый остаток будет считаться на момент проведения — это делает логика учёта, не эта форма.",
            "The planned balance will be calculated at posting time by stock logic, not by this form.",
            "Tồn kế hoạch sẽ được tính lúc ghi sổ bởi logic kho.",
          )}
        </p>
      )}

      <div className={`erpInvSeg ${locked ? "off" : ""}`}>
        <span>{T("Тип инвентаризации", "Count type", "Loại kiểm kê")}</span>
        <div className="erpInvSegBtns">
          <button type="button" className={doc.mode === "full" ? "on" : ""} disabled={locked} data-testid="inventory-mode-full" onClick={() => set({ mode: "full" as CountMode, product_ids: [], category_ids: [] })}>
            {T("Полная", "Full", "Toàn bộ")}
          </button>
          <button type="button" className={doc.mode === "partial" ? "on" : ""} disabled={locked} data-testid="inventory-mode-partial" onClick={() => set({ mode: "partial" as CountMode })}>
            {T("Частичная", "Partial", "Một phần")}
          </button>
        </div>
      </div>
      <EligibleHint doc={doc} eligibleCount={eligibleIds ? eligibleIds.length : null} idleCount={idleCount} />

      {doc.mode === "partial" ? (
        <div className="erpInvScope">
          <input type="search" className="erpSearch" placeholder={T("Найти категорию или продукт", "Find a category or product", "Tìm nhóm hoặc sản phẩm")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="erpInvScopeCols">
            <div>
              <h3>{T("Категории", "Categories", "Nhóm")}</h3>
              {categories.map((c) => (
                <label key={c.id} className="erpDropItem">
                  <input
                    type="checkbox"
                    checked={doc.category_ids.includes(c.id)}
                    onChange={() => set({ category_ids: doc.category_ids.includes(c.id) ? doc.category_ids.filter((id) => id !== c.id) : [...doc.category_ids, c.id] })}
                  />
                  <span>{c.name_vn && c.name_vn !== c.name_en ? `${c.name_en} / ${c.name_vn}` : c.name_en}</span>
                </label>
              ))}
            </div>
            <div>
              <h3>{T("Продукты", "Products", "Sản phẩm")}</h3>
              {products.slice(0, 80).map((p) => (
                <label key={p.id} className="erpDropItem" data-testid={`inventory-product-${p.id}`}>
                  <input
                    type="checkbox"
                    checked={doc.product_ids.includes(p.id)}
                    onChange={() => set({ product_ids: doc.product_ids.includes(p.id) ? doc.product_ids.filter((id) => id !== p.id) : [...doc.product_ids, p.id] })}
                  />
                  <span>
                    {productTitle(p)}
                    {p.brand ? ` · ${p.brand}` : ""}
                  </span>
                </label>
              ))}
              {products.length > 80 ? <p className="erpHint">{T("Уточните поиск, чтобы увидеть остальные.", "Narrow the search to see the rest.", "Hãy thu hẹp tìm kiếm.")}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {problems.length ? (
        <ul className="erpProblems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="erpBtn primary" data-testid="inventory-create" disabled={busy || Boolean(problems.length)} onClick={onSave}>
        {T("Сохранить", "Save", "Lưu")}
      </button>
    </section>
  );
}

function CountTable({
  doc,
  setLine,
  persist,
  post,
  uncounted,
  editable,
  openMs,
}: {
  doc: CountDoc;
  setLine: (productId: string, patch: Partial<CountLine>) => void;
  persist: () => void;
  post: () => void;
  uncounted: number;
  editable: boolean;
  openMs: number;
}) {
  const { state } = useErp();
  const [query, setQuery] = useState("");
  const [openMoves, setOpenMoves] = useState<Record<string, "in" | "out" | "writeoff" | "">>({});
  const [confirmPost, setConfirmPost] = useState(false);
  if (!state) return null;
  const q = query.trim().toLowerCase();
  const rows = doc.lines.filter((line) => {
    const product = productById(state, line.product_id);
    return !q || `${product ? productTitle(product) : ""} ${product?.brand ?? ""}`.toLowerCase().includes(q);
  });

  const postBlocked = !doc.postingReady;
  const postTitle = postBlocked
    ? T(
        "Проведение ждёт контракт логики (/api/erp/counts или расширенный postDocument type=count). Кнопка не отмечает успех.",
        "Posting waits for the logic contract (/api/erp/counts or an extended postDocument type=count). This button does not report success.",
        "Ghi sổ chờ hợp đồng logic. Nút này không báo thành công.",
      )
    : uncounted
      ? T("Сначала посмотрите непосчитанные позиции", "Review uncounted items first", "Hãy xem hàng chưa đếm")
      : T("Провести инвентаризацию", "Post the stock count", "Ghi sổ kiểm kê");

  return (
    <section className="erpCard erpInvCount">
      <div className="erpInvCountHead">
        <p>
          {T("Склад", "Location", "Kho")}: <b>{state.warehouses.find((w) => w.id === doc.warehouse_id)?.name ?? "—"}</b>
          {" · "}
          {doc.mode === "partial" ? T("Частичная", "Partial", "Một phần") : T("Полная", "Full", "Toàn bộ")}
          {" · "}
          {dateTimeText(doc.counted_at)}
        </p>
        <StatusBadge status={doc.status === "editing" ? "draft" : doc.status} />
        <span className="erpHint">
          {T("Открытие документа", "Document open", "Mở chứng từ")}: {openMs} {T("мс", "ms", "ms")}
        </span>
      </div>
      {!doc.periodReady ? (
        <p className="erpNotice warn" data-testid="inventory-logic-todo">
          {T(
            "Список периода и проведение доступны через /api/erp/counts. Пока API нет, полный список не подменяется текущими ненулевыми остатками.",
            "The period list and posting come from /api/erp/counts. Until that API exists, the full list is not replaced with current non-zero stock.",
            "Danh sách kỳ và ghi sổ đến từ /api/erp/counts. Không thay bằng tồn khác 0 hiện tại.",
          )}
        </p>
      ) : doc.idle.length ? (
        <p className="erpHint" data-testid="inventory-idle">
          {T(
            `Без движения за период, не в корректировке: ${doc.idle.length}`,
            `No movement in the period, not adjusted: ${doc.idle.length}`,
            `Không phát sinh trong kỳ, không điều chỉnh: ${doc.idle.length}`,
          )}
        </p>
      ) : null}

      <div className="erpInvTabs" role="tablist">
        <span className="on">{T("Продукты", "Products", "Sản phẩm")}</span>
        <span title={T("Вкладка Poster «Тех. карты и полуфабрикаты» ждёт контракт логики", "Poster's Recipes & preps tab waits for the logic contract", "Tab công thức chờ logic")}>
          {T("Тех. карты и полуфабрикаты", "Recipes & preps", "Công thức & BTP")}
        </span>
        <span title={T("Вкладка Poster «Производства» ждёт контракт логики", "Poster's Production tab waits for the logic contract", "Tab sản xuất chờ logic")}>
          {T("Производства", "Production", "Sản xuất")}
        </span>
      </div>

      <input type="search" className="erpSearch" placeholder={T("Быстрый поиск", "Quick search", "Tìm nhanh")} value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="erpTableWrap">
        <table className="erpTable erpInvLines" data-testid="inventory-lines">
          <thead>
            <tr>
              <th>{T("Товар", "Product", "Hàng")}</th>
              <th>{T("Бренд", "Brand", "Thương hiệu")}</th>
              <th>{T("Единица", "Unit", "Đơn vị")}</th>
              <th>{T("Последняя проверка", "Last count", "Lần kiểm trước")}</th>
              <th className="num">{T("Начальный остаток", "Opening", "Tồn đầu")}</th>
              <th className="num">{T("Поступления", "In", "Nhập")}</th>
              <th className="num">{T("Расход", "Usage", "Xuất dùng")}</th>
              <th className="num">{T("Списания", "Write-offs", "Xuất hủy")}</th>
              <th className="num">{T("Плановый остаток", "Planned", "Tồn kế hoạch")}</th>
              <th>{T("Фактический остаток", "Actual", "Tồn thực tế")}</th>
              <th className="num">{T("Разница", "Qty difference", "Chênh SL")}</th>
              <th className="num">{T("Разница в деньгах", "Value difference", "Chênh tiền")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line) => {
              const product = productById(state, line.product_id);
              const unit = unitOf(state, line.product_id);
              const packs = compatiblePacks(state.packs, unit);
              const pack = packs.find((p) => p.id === line.pack_id);
              const planned = line.planned_qty;
              const diff = line.fact_qty === null || planned === null ? null : line.fact_qty - planned;
              const open = openMoves[line.product_id] ?? "";
              return (
                <tr key={line.product_id} className={line.fact_qty === null ? "erpInvUncounted" : ""}>
                  <td className="main">
                    <span className="erpName" data-testid={`inventory-name-${line.product_id}`}>
                      {product ? productTitle(product) : line.product_id}
                    </span>
                  </td>
                  <td>{product?.brand || "—"}</td>
                  <td>{unit ?? "—"}</td>
                  <td>{line.last_check ? dateTimeText(line.last_check) : "—"}</td>
                  <td className="num">{qtyText(line.opening_qty, unit)}</td>
                  <td className="num">
                    <MoveCell kind="in" line={line} open={open} onToggle={() => setOpenMoves((prev) => ({ ...prev, [line.product_id]: open === "in" ? "" : "in" }))} />
                  </td>
                  <td className="num">
                    <MoveCell kind="out" line={line} open={open} onToggle={() => setOpenMoves((prev) => ({ ...prev, [line.product_id]: open === "out" ? "" : "out" }))} />
                  </td>
                  <td className="num">
                    <MoveCell kind="writeoff" line={line} open={open} onToggle={() => setOpenMoves((prev) => ({ ...prev, [line.product_id]: open === "writeoff" ? "" : "writeoff" }))} />
                  </td>
                  <td className="num">
                    {qtyText(planned, unit)}
                    {!doc.periodReady ? <small className="erpCellSub">{T("текущий остаток ERP", "current ERP stock", "tồn ERP hiện tại")}</small> : null}
                  </td>
                  <td className="edit">
                    {editable ? (
                      <div className="erpInvFact">
                        <span data-testid={`inventory-fact-${line.product_id}`}>
                          <QtyInput
                            base={unit}
                            value={line.fact_qty}
                            onChange={(v) => setLine(line.product_id, { fact_qty: v, pack_qty: null })}
                          />
                        </span>
                        {packs.length ? (
                          <select
                            value={line.pack_id ?? ""}
                            onChange={(e) => setLine(line.product_id, { pack_id: e.target.value || null, pack_qty: null })}
                            aria-label={T("Фасовка", "Pack", "Quy cách")}
                          >
                            <option value="">{T("базовая единица", "base unit", "đơn vị gốc")}</option>
                            {packs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {packText(p.name)} = {qtyText(p.qty_base, unit)}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {pack ? (
                          <NumberInput
                            value={line.pack_qty}
                            placeholder={T("фасовок", "packs", "quy cách")}
                            onChange={(v) => setLine(line.product_id, { pack_qty: v, fact_qty: v === null ? line.fact_qty : packToBase(v, pack.qty_base) })}
                          />
                        ) : null}
                        {line.fact_qty === null ? <small className="erpCellSub">{T("не посчитано", "not counted", "chưa đếm")}</small> : null}
                      </div>
                    ) : (
                      line.fact_qty === null ? T("не посчитано", "not counted", "chưa đếm") : qtyText(line.fact_qty, unit)
                    )}
                  </td>
                  <td className="num">
                    {diff === null ? "—" : <span className={diff < 0 ? "erpBadge bad" : diff > 0 ? "erpBadge ok" : "erpMuted"}>{diff > 0 ? "+" : ""}{qtyText(diff, unit)}</span>}
                  </td>
                  <td className="num">
                    {line.fact_qty === null ? "—" : line.cost_known === false ? <span className="erpBadge warn">{T("цена неизвестна", "price unknown", "chưa rõ giá")}</span> : line.diff_amount === null ? T("ждёт FIFO логики", "waiting for FIFO logic", "chờ FIFO") : vnd(line.diff_amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editable ? (
        <div className="erpActions">
          <button type="button" className="erpBtn" data-testid="inventory-save-draft" onClick={persist}>
            {T("Сохранить черновик", "Save draft", "Lưu nháp")}
          </button>
          <button
            type="button"
            className="erpBtn primary"
            data-testid="inventory-post"
            title={postTitle}
            onClick={() => {
              setConfirmPost(true);
              if (doc.postingReady && !uncounted) post();
            }}
          >
            {T("Провести инвентаризацию", "Post stock count", "Ghi sổ kiểm kê")}
          </button>
        </div>
      ) : null}

      {confirmPost ? (
        <div className="erpNotice warn" data-testid="inventory-uncounted">
          {uncounted ? (
            <p>
              {T(
                `Не посчитано позиций: ${uncounted}. Пустое поле — не ноль.`,
                `${uncounted} items are not counted. An empty field is not zero.`,
                `${uncounted} dòng chưa đếm. Ô trống không phải 0.`,
              )}
            </p>
          ) : doc.postingReady ? (
            <p>{T("Документ проводится.", "The document is being posted.", "Đang ghi sổ.")}</p>
          ) : (
            <p>
              {T(
                "Все позиции заполнены, но проведение ждёт /api/erp/counts.",
                "Every line is filled, but posting still waits for /api/erp/counts.",
                "Mọi dòng đã điền, nhưng ghi sổ vẫn chờ /api/erp/counts.",
              )}
            </p>
          )}
          <button type="button" className="erpBtn" onClick={() => setConfirmPost(false)}>
            {T("Закрыть", "Close", "Đóng")}
          </button>
        </div>
      ) : null}
      {doc.created_by || doc.posted_by ? (
        <p className="erpHint">
          {T("Создал", "Created by", "Tạo bởi")} {doc.created_by ?? "—"}
          {doc.posted_at ? ` · ${T("провёл", "posted by", "ghi sổ")} ${doc.posted_by ?? "—"} · ${dateTimeText(doc.posted_at)}` : ""}
        </p>
      ) : null}
    </section>
  );
}

function MoveCell({
  kind,
  line,
  open,
  onToggle,
}: {
  kind: "in" | "out" | "writeoff";
  line: CountLine;
  open: string;
  onToggle: () => void;
}) {
  const qty = kind === "in" ? line.in_qty : kind === "out" ? line.out_qty : line.writeoff_qty;
  const moves = line.movements?.[kind] ?? [];
  return (
    <div>
      <button type="button" className="erpInvMove" onClick={onToggle} aria-expanded={open === kind}>
        {qty === null ? "—" : qty} ▾
      </button>
      {open === kind ? (
        <div className="erpInvMoveList">
          {moves.length ? (
            moves.map((m) => (
              <NavLink key={m.id} href={m.href ?? `/erp/documents/${m.doc_id}`} className="erpLink">
                {m.doc_no ?? m.doc_type} · {dateTimeText(m.at)} · {m.qty}
              </NavLink>
            ))
          ) : (
            <p className="erpHint">
              {T("Документы-основания появятся из API логики. Продажи не считаем учтёнными.", "Source documents will come from the logic API. Sales are not treated as posted.", "Chứng từ gốc sẽ đến từ API logic.")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
