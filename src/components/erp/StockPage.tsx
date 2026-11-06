"use client";

import { useEffect, useMemo, useState } from "react";
import { supplierCategoryIds } from "@/lib/erp/supplierCategories";
import type { ErpCategory, ErpDocType, ErpDocument, ErpSupplier, ErpWarehouse } from "@/lib/erp/types";
import { describeText, DocTable, documentListCells, documentListColumns, downloadDocumentExport, fetchAllDocuments, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { MovementReport } from "./MovementReport";
import { InventoryPage } from "./InventoryPage";
import { ReceiptsPage } from "./ReceiptsPage";
import { RefList } from "./RefList";
import { StockMobileNav } from "./stockNav";
import { Empty, NavLink, PageHead, T, today } from "./ui";
import { WriteoffsPage } from "./WriteoffsPage";

export const STOCK_KINDS: Record<string, { types: ErpDocType[]; newHref: string }> = {
  receipts: { types: ["receipt", "opening"], newHref: "/erp/documents/new?type=receipt" },
  processing: { types: ["production"], newHref: "/erp/preps/batch/new" },
  transfers: { types: ["transfer"], newHref: "/erp/documents/new?type=transfer" },
  writeoffs: { types: ["writeoff"], newHref: "/erp/documents/new?type=writeoff" },
  counts: { types: ["count"], newHref: "/erp/stock/counts/new" },
};

export const stockKindOf = (type: ErpDocType) =>
  type === "receipt" || type === "opening"
    ? "receipts"
    : type === "transfer"
      ? "transfers"
      : type === "writeoff"
        ? "writeoffs"
        : type === "count"
          ? "counts"
          : "processing";

export function StockReportPage() {
  return <MovementReport tabs={<StockMobileNav active="/erp/stock/report" />} />;
}

const addText = () => T("Добавить", "Add", "Thêm");

const kindTexts = (): Record<string, { title: string; sub: string; empty: string; text: string }> => ({
  receipts: {
    title: T("Поставки", "Deliveries", "Nhập hàng"),
    sub: T("Принятые поставки от поставщиков и начальные остатки.", "Deliveries received from suppliers and opening balances.", "Hàng nhập từ nhà cung cấp và tồn đầu kỳ."),
    empty: T("Поставок ещё не было", "No deliveries yet", "Chưa có lần nhập hàng"),
    text: T("Принятые поставки и начальные остатки появятся здесь.", "Received deliveries and opening balances appear here.", "Các lần nhập hàng sẽ hiện ở đây."),
  },
  processing: {
    title: T("Переработки", "Processing", "Chế biến"),
    sub: T(
      "Изготовление полуфабрикатов по рецептуре: сырьё списывается со склада, готовый полуфабрикат приходуется.",
      "Making semi-finished products from a recipe: ingredients leave stock, the finished product is added.",
      "Sản xuất bán thành phẩm theo công thức: trừ nguyên liệu, nhập thành phẩm vào kho.",
    ),
    empty: T("Переработок ещё не было", "No processing yet", "Chưa có lần chế biến"),
    text: T("Здесь появятся изготовленные партии полуфабрикатов и черновики.", "Produced batches and drafts will appear here.", "Các mẻ đã sản xuất và bản nháp sẽ hiện ở đây."),
  },
  transfers: {
    title: T("Перемещения", "Transfers", "Chuyển kho"),
    sub: T("Перемещения продуктов между складами.", "Moving products between locations.", "Chuyển hàng giữa các kho."),
    empty: T("Перемещений ещё не было", "No transfers yet", "Chưa có chuyển kho"),
    text: T("Например, со склада на кухню заготовок или в фудтрак.", "For example, from the warehouse to the prep kitchen or the food truck.", "Ví dụ: từ kho sang bếp sơ chế hoặc xe bán đồ ăn."),
  },
  writeoffs: {
    title: T("Списания", "Write-offs", "Xuất hủy"),
    sub: T("Порча, истёкший срок, пробы — всё, что ушло не в продажу.", "Spoilage, expired stock, tastings — anything not sold.", "Hư hỏng, hết hạn, thử món…"),
    empty: T("Списаний ещё не было", "No write-offs yet", "Chưa có xuất hủy"),
    text: T("Списанные продукты появятся здесь.", "Written-off products appear here.", "Hàng đã xuất hủy sẽ hiện ở đây."),
  },
  counts: {
    title: T("Инвентаризации", "Stock counts", "Kiểm kê"),
    sub: T("Пересчёт продуктов на складе — разница с учётом исправляется автоматически.", "Counting what is on the shelf — differences are corrected automatically.", "Đếm hàng thực tế — chênh lệch sẽ tự điều chỉnh."),
    empty: T("Инвентаризаций ещё не было", "No stock counts yet", "Chưa kiểm kê"),
    text: T("Проведённые инвентаризации появятся здесь.", "Completed stock counts appear here.", "Các lần kiểm kê sẽ hiện ở đây."),
  },
});

export function StockDocsPage({ kind }: { kind: string }) {
  if (kind === "receipts") return <ReceiptsPage />;
  if (kind === "writeoffs") return <WriteoffsPage tab="list" />;
  if (kind === "counts") return <InventoryPage />;
  return <StockDocsList kind={kind} />;
}

function StockDocsList({ kind }: { kind: string }) {
  const { state } = useErp();
  const config = STOCK_KINDS[kind];
  const docs = useDocuments(config ? config.types : []);
  const [query, setQuery] = useState("");
  const [busyOut, setBusyOut] = useState(false);
  const [printRows, setPrintRows] = useState<ErpDocument[] | null>(null);

  useEffect(() => {
    if (!printRows) return;
    const done = () => setPrintRows(null);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printRows]);

  if (!state) return null;
  if (!config) {
    return (
      <Empty
        kind="error"
        title={T("Раздел не найден", "Page not found", "Không tìm thấy")}
        action={
          <NavLink href="/erp/stock" className="erpBtn">
            {T("К остаткам", "Back to stock", "Về tồn kho")}
          </NavLink>
        }
      />
    );
  }
  const texts = kindTexts()[kind];
  const add = (
    <NavLink href={config.newHref} className="erpBtn primary erpNoPrint">
      {addText()}
    </NavLink>
  );
  const q = query.trim().toLowerCase();
  const matches = (doc: ErpDocument) =>
    !q || `${doc.doc_no ?? ""} ${doc.batch_no ?? ""} ${doc.comment ?? ""} ${describeText(state, doc)}`.toLowerCase().includes(q);
  const filtered = docs.documents?.filter(matches);
  const fileStem = kind === "processing" ? "processing" : "transfers";
  const loadMatching = async () => (await fetchAllDocuments(config.types)).filter(matches);
  const exportList = async () => {
    if (busyOut || !docs.documents) return;
    setBusyOut(true);
    try {
      const header = documentListColumns();
      const rows = (await loadMatching()).map((doc) => documentListCells(state, doc));
      downloadDocumentExport(`${fileStem}_${today()}`, texts.title, header, rows);
    } catch {
      /* button re-enables; nothing to download */
    } finally {
      setBusyOut(false);
    }
  };
  const printList = async () => {
    if (busyOut || !docs.documents) return;
    setBusyOut(true);
    try {
      setPrintRows(await loadMatching());
    } catch {
      /* button re-enables */
    } finally {
      setBusyOut(false);
    }
  };
  const empty = q ? (
    <Empty title={T("Ничего не найдено", "No matches", "Không tìm thấy")} text={T("Попробуйте изменить поиск.", "Try changing the search.", "Hãy đổi từ khóa.")} />
  ) : (
    <Empty title={texts.empty} text={texts.text} action={add} />
  );

  return (
    <>
      <PageHead
        title={texts.title}
        sub={texts.sub}
        actions={
          <>
            <div className="erpHeadGroup erpNoPrint">
              <button type="button" className="erpHeadBtn" onClick={() => void exportList()} disabled={busyOut || !docs.documents} data-testid="docs-export">
                {T("Экспорт", "Export", "Xuất")}
              </button>
              <button type="button" className="erpHeadBtn" onClick={() => void printList()} disabled={busyOut || !docs.documents} data-testid="docs-print">
                {T("Печать", "Print", "In")}
              </button>
            </div>
            {add}
          </>
        }
      />
      <div className="erpNoPrint">
        <StockMobileNav active={`/erp/stock/${kind}`} />
      </div>
      <div className="erpToolbar erpFilters erpNoPrint">
        <input
          className="erpSearch"
          type="search"
          placeholder={T("Поиск…", "Search…", "Tìm…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={T("Поиск", "Search", "Tìm")}
          data-testid="docs-search"
        />
      </div>
      <div className={printRows ? "erpDocsPrinting" : undefined}>
        <div className="erpDocsScreen">
          <DocTable state={state} {...docs} documents={filtered ?? null} showType={kind === "receipts"} empty={empty} />
        </div>
        {printRows ? (
          <div className="erpPrintOnly erpPrintArea" data-testid="docs-print-area">
            <h2>
              {texts.title}
              {q ? ` · ${query.trim()}` : ""}
            </h2>
            <table className="erpTable" data-testid="docs-print-table">
              <thead>
                <tr>
                  {documentListColumns().map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printRows.length ? (
                  printRows.map((doc) => (
                    <tr key={doc.id}>
                      {documentListCells(state, doc).map((cell, i) => (
                        <td key={i} className={i === 4 ? "num" : undefined}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>{T("Нет строк для печати", "Nothing to print", "Không có dòng để in")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function SuppliersPage() {
  const { state } = useErp();
  const [categoryId, setCategoryId] = useState("");
  const [nameDesc, setNameDesc] = useState(false);
  const bySupplier = useMemo(() => {
    if (!state) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const supplier of state.suppliers) {
      const ids = supplierCategoryIds(supplier.id, state.products, state.productPacks);
      map.set(
        supplier.id,
        ids
          .map((id) => state.categories.find((c) => c.id === id))
          .filter((c): c is ErpCategory => c != null && !c.archived_at && !c.deleted_at)
          .map((c) => c.name_en)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      );
    }
    return map;
  }, [state]);
  const categoryOptions = useMemo(() => {
    if (!state) return [];
    const used = new Set<string>();
    for (const supplier of state.suppliers) {
      for (const id of supplierCategoryIds(supplier.id, state.products, state.productPacks)) used.add(id);
    }
    return state.categories
      .filter((c) => used.has(c.id) && !c.archived_at && !c.deleted_at)
      .slice()
      .sort((a, b) => a.name_en.localeCompare(b.name_en, undefined, { sensitivity: "base" }));
  }, [state]);
  if (!state) return null;

  const rows = state.suppliers
    .filter((supplier) => {
      if (!categoryId) return true;
      return supplierCategoryIds(supplier.id, state.products, state.productPacks).includes(categoryId);
    })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * (nameDesc ? -1 : 1));

  return (
    <>
      <PageHead title={T("Поставщики", "Suppliers", "Nhà cung cấp")} sub={T("У кого вы закупаете продукты.", "Who you buy products from.", "Nơi bạn mua hàng.")} />
      <StockMobileNav active="/erp/stock/suppliers" />
      <div className="erpFilters">
        <label className="erpField">
          <span>{T("Категория", "Category", "Nhóm")}</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{T("Все категории", "All categories", "Tất cả nhóm")}</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_en}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SupplierTable rows={rows} categories={bySupplier} nameDesc={nameDesc} onToggleName={() => setNameDesc((v) => !v)} />
    </>
  );
}

function SupplierTable({
  rows,
  categories,
  nameDesc,
  onToggleName,
}: {
  rows: ErpSupplier[];
  categories: Map<string, string[]>;
  nameDesc: boolean;
  onToggleName: () => void;
}) {
  return (
    <RefList<ErpSupplier & { category_names: string }>
      entity="supplier"
      rows={rows.map((row) => ({ ...row, category_names: (categories.get(row.id) ?? []).join(", ") }))}
      columns={[
        { key: "name", label: `${T("Название", "Name", "Tên")} ${nameDesc ? "↓" : "↑"}` },
        { key: "category_names", label: T("Категория", "Category", "Nhóm"), readOnly: true },
        { key: "zalo_url", label: T("Ссылка Zalo", "Zalo link", "Liên kết Zalo"), placeholder: "https://zalo.me/…" },
      ]}
      addLabel={T("Добавить поставщика", "Add supplier", "Thêm nhà cung cấp")}
      emptyTitle={T("Поставщиков пока нет", "No suppliers yet", "Chưa có nhà cung cấp")}
      emptyText={T("Добавьте поставщиков, чтобы указывать их в поставках.", "Add suppliers to use them in deliveries.", "Thêm nhà cung cấp để dùng khi nhập hàng.")}
      onHeaderClick={(key) => {
        if (key === "name") onToggleName();
      }}
    />
  );
}

const warehouseKinds = (): [string, string][] => [
  ["warehouse", T("Склад", "Warehouse", "Kho")],
  ["prep_kitchen", T("Кухня заготовок", "Prep kitchen", "Bếp sơ chế")],
  ["online_kitchen", T("Онлайн-кухня", "Online kitchen", "Bếp online")],
  ["food_truck", T("Фудтрак", "Food truck", "Xe bán đồ ăn")],
  ["other", T("Другое", "Other", "Khác")],
];

export function WarehousesPage() {
  const { state } = useErp();
  if (!state) return null;
  return (
    <>
      <PageHead
        title={T("Склады", "Locations", "Kho")}
        sub={T("Места, где лежат продукты: основной склад, кухня заготовок, онлайн-кухня, фудтрак.", "Places where products are kept: main warehouse, prep kitchen, online kitchen, food truck.", "Nơi để hàng: kho chính, bếp sơ chế, bếp online, xe bán đồ ăn.")}
      />
      <StockMobileNav active="/erp/stock/warehouses" />
      <RefList<ErpWarehouse>
        entity="warehouse"
        rows={state.warehouses}
        columns={[
          { key: "name", label: T("Название", "Name", "Tên") },
          { key: "kind", label: T("Тип", "Kind", "Loại"), kind: "select", options: warehouseKinds() },
        ]}
        addLabel={T("Добавить склад", "Add location", "Thêm kho")}
        emptyTitle={T("Складов пока нет", "No locations yet", "Chưa có kho")}
        emptyText={T("Добавьте хотя бы один склад, чтобы принимать поставки.", "Add at least one location to receive deliveries.", "Thêm ít nhất một kho để nhập hàng.")}
      />
    </>
  );
}

export { PacksPage } from "./PacksPage";
