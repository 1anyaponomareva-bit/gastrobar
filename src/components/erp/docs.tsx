"use client";

import { useErpRouter } from "./erpHref";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { documentSupplierLabel } from "@/lib/erp/docSupplier";
import { downloadXlsx } from "@/lib/erp/xlsx";
import { useErp } from "./ErpShell";
import type { ErpDocType, ErpDocument, ErpState } from "@/lib/erp/types";
import { dateText, docLabel, Empty, errorText, loadingText, productName, qtyText, statusLabel, T, unitOf, vnd, warehouseName } from "./ui";

export const docHref = (doc: Pick<ErpDocument, "id" | "doc_type">) =>
  doc.doc_type === "production" ? `/erp/preps/batch/${doc.id}` : doc.doc_type === "count" ? `/erp/stock/counts/${doc.id}` : `/erp/documents/${doc.id}`;

type DocPage = { documents: ErpDocument[]; more: boolean };
type CachedList = DocPage & { docsVersion: number };

/** Lists seen during this visit, so going back to a section shows it at once while it refreshes. */
const listCache = new Map<string, CachedList>();

async function fetchDocPage(types: string, limit: number | undefined, before?: string): Promise<DocPage> {
  const params = new URLSearchParams();
  if (types) params.set("type", types);
  if (limit) params.set("limit", String(limit));
  if (before) params.set("before", before);
  const response = await fetch(`/api/erp/documents?${params}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "server");
  return data as DocPage;
}

/** Full current type list for export/print (same documents route, page size 300). */
export async function fetchAllDocuments(types: ErpDocType[]): Promise<ErpDocument[]> {
  const typeList = types.join(",");
  const out: ErpDocument[] = [];
  const seen = new Set<string>();
  let before: string | undefined;
  let more = true;
  let hops = 0;
  while (more && hops++ < 40) {
    const page = await fetchDocPage(typeList, 300, before);
    const fresh = page.documents.filter((doc) => doc.id && !seen.has(doc.id));
    for (const doc of fresh) {
      seen.add(doc.id!);
      out.push(doc);
    }
    more = Boolean(page.more) && fresh.length > 0;
    before = out.at(-1)?.created_at;
    if (!fresh.length) break;
  }
  return out;
}

export function describeText(state: ErpState, doc: ErpDocument): string {
  const supplier = documentSupplierLabel(state, doc);
  switch (doc.doc_type) {
    case "transfer":
      return `${warehouseName(state, doc.warehouse_id)} → ${warehouseName(state, doc.target_warehouse_id)}`;
    case "production": {
      const extra =
        doc.target_warehouse_id && doc.target_warehouse_id !== doc.warehouse_id ? ` → ${warehouseName(state, doc.target_warehouse_id)}` : "";
      return `${productName(state, doc.output_product_id)} · ${qtyText(doc.output_qty, unitOf(state, doc.output_product_id))} · ${warehouseName(state, doc.warehouse_id)}${extra}`;
    }
    case "receipt":
      return `${warehouseName(state, doc.warehouse_id)}${supplier ? ` · ${supplier}` : ""}`;
    case "writeoff": {
      const reason = (doc.reason_id && state.writeoffReasons?.find((r) => r.id === doc.reason_id)?.name) || doc.reason;
      return `${warehouseName(state, doc.warehouse_id)}${reason ? ` · ${reason}` : ""}`;
    }
    default:
      return warehouseName(state, doc.warehouse_id);
  }
}

export function documentListColumns(): string[] {
  return [
    T("Документ", "Document", "Chứng từ"),
    T("Дата", "Date", "Ngày"),
    T("Что и где", "What and where", "Nơi / hàng"),
    T("Статус", "Status", "Trạng thái"),
    T("Сумма", "Amount", "Tiền"),
  ];
}

export function documentListCells(state: ErpState, doc: ErpDocument): string[] {
  const name = doc.doc_type === "production" && doc.batch_no ? doc.batch_no : (doc.doc_no ?? "");
  const amount = doc.status !== "posted" ? "—" : doc.cost_known ? vnd(doc.total_cost) : T("неполная", "incomplete", "chưa đủ");
  return [name, dateText(doc.doc_date), describeText(state, doc), statusLabel(doc.status ?? "draft"), amount];
}

export function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const cell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** CSV (Excel-friendly BOM) plus .xlsx, same columns as the print list. */
export function downloadDocumentExport(filename: string, sheetName: string, header: string[], rows: string[][]) {
  downloadCsv(filename, header, rows);
  downloadXlsx(filename, sheetName, header, rows);
}

const loadErrorText = (e: unknown) => errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network");

/**
 * Newest documents of the given types (all types for null), a page at a time. A list seen before
 * shows immediately and refreshes in the background; after a document change in this visit it is
 * loaded again before showing, so statuses are never shown out of date.
 */
export function useDocuments(types: ErpDocType[] | null, limit?: number) {
  const { docsVersion } = useErp();
  const typeList = types?.join(",") ?? "";
  const key = `${typeList}|${limit ?? ""}`;
  const cached = listCache.get(key);
  const [page, setPage] = useState<DocPage | null>(cached && cached.docsVersion === docsVersion ? cached : null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Only the newest request may change the list. */
  const request = useRef(0);

  const show = useCallback(
    (next: DocPage) => {
      listCache.set(key, { ...next, docsVersion });
      setPage(next);
    },
    [key, docsVersion],
  );

  const load = useCallback(async () => {
    const id = ++request.current;
    const fresh = listCache.get(key);
    if (fresh && fresh.docsVersion === docsVersion) setPage(fresh);
    else setPage(null);
    setError(null);
    try {
      const next = await fetchDocPage(typeList, limit);
      if (id === request.current) show(next);
    } catch (e) {
      if (id !== request.current) return;
      // A list already on screen stays; only an empty screen shows the error.
      if (!(fresh && fresh.docsVersion === docsVersion)) setError(loadErrorText(e));
    }
  }, [key, typeList, limit, docsVersion, show]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    const current = page;
    const last = current?.documents.at(-1);
    if (!current || !last?.created_at) return;
    const id = ++request.current;
    setLoadingMore(true);
    try {
      const next = await fetchDocPage(typeList, limit, last.created_at);
      if (id !== request.current) return;
      const seen = new Set(current.documents.map((doc) => doc.id));
      show({ documents: [...current.documents, ...next.documents.filter((doc) => !seen.has(doc.id))], more: next.more });
    } catch (e) {
      if (id === request.current) setError(loadErrorText(e));
    } finally {
      if (id === request.current) setLoadingMore(false);
    }
  }, [typeList, limit, page, show]);

  return { documents: page?.documents ?? null, more: page?.more ?? false, loadMore, loadingMore, error, reload: load };
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "draft";
  return <span className={`erpBadge ${s === "posted" ? "ok" : s === "cancelled" ? "bad" : ""}`}>{statusLabel(s)}</span>;
}

function describe(state: ErpState, doc: ErpDocument): ReactNode {
  const supplier = documentSupplierLabel(state, doc);
  switch (doc.doc_type) {
    case "transfer":
      return `${warehouseName(state, doc.warehouse_id)} → ${warehouseName(state, doc.target_warehouse_id)}`;
    case "production":
      return (
        <>
          {productName(state, doc.output_product_id)} · {qtyText(doc.output_qty, unitOf(state, doc.output_product_id))}
          <span className="erpCellSub">
            {warehouseName(state, doc.warehouse_id)}
            {doc.target_warehouse_id !== doc.warehouse_id ? ` → ${warehouseName(state, doc.target_warehouse_id)}` : ""}
          </span>
        </>
      );
    case "receipt":
      return `${warehouseName(state, doc.warehouse_id)}${supplier ? ` · ${supplier}` : ""}`;
    case "writeoff": {
      const reason = (doc.reason_id && state.writeoffReasons?.find((r) => r.id === doc.reason_id)?.name) || doc.reason;
      return `${warehouseName(state, doc.warehouse_id)}${reason ? ` · ${reason}` : ""}`;
    }
    default:
      return warehouseName(state, doc.warehouse_id);
  }
}

export function DocTable({
  state,
  documents,
  error,
  reload,
  showType,
  empty,
  more,
  loadMore,
  loadingMore,
}: {
  state: ErpState;
  documents: ErpDocument[] | null;
  error: string | null;
  reload: () => void;
  showType?: boolean;
  empty: ReactNode;
  more?: boolean;
  loadMore?: () => void;
  loadingMore?: boolean;
}) {
  const router = useErpRouter();
  if (error) {
    return (
      <Empty
        kind="error"
        title={T("Не удалось загрузить документы", "Could not load documents", "Không tải được chứng từ")}
        text={error}
        action={
          <button type="button" className="erpBtn" onClick={reload}>
            {T("Повторить", "Try again", "Thử lại")}
          </button>
        }
      />
    );
  }
  if (!documents) return <div className="erpLoading">{loadingText()}</div>;
  if (!documents.length) return <>{empty}</>;
  return (
    <div className="erpTableWrap">
      <table className="erpTable stack">
        <thead>
          <tr>
            <th>{T("Документ", "Document", "Chứng từ")}</th>
            <th>{T("Что и где", "What and where", "Nội dung")}</th>
            <th>{T("Статус", "Status", "Trạng thái")}</th>
            <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className={`clickable ${doc.status === "cancelled" ? "muted" : ""}`} onClick={() => router.push(docHref(doc))}>
              <td className="main">
                <span className="erpName">
                  {showType ? `${docLabel(doc.doc_type)} ` : ""}
                  {doc.doc_type === "production" && doc.batch_no ? doc.batch_no : doc.doc_no}
                </span>
                <span className="erpCellSub">{dateText(doc.doc_date)}</span>
              </td>
              <td data-label={T("Что и где", "What and where", "Nội dung")}>{describe(state, doc)}</td>
              <td data-label={T("Статус", "Status", "Trạng thái")}>
                <StatusBadge status={doc.status} />
              </td>
              <td className="num" data-label={T("Сумма", "Amount", "Số tiền")}>
                {doc.status !== "posted" ? (
                  "—"
                ) : doc.cost_known ? (
                  vnd(doc.total_cost)
                ) : (
                  <span className="erpBadge warn">{T("неполная", "incomplete", "chưa đủ")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {more && loadMore ? (
        <div className="erpDocMore erpNoPrint">
          <button type="button" className="erpBtn" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? loadingText() : T("Показать ещё", "Show more", "Xem thêm")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
