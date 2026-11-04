"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ErpDocType, ErpDocument, ErpState } from "@/lib/erp/types";
import { dateText, docLabel, Empty, errorText, loadingText, productName, qtyText, statusLabel, T, unitOf, vnd, warehouseName } from "./ui";

export const docHref = (doc: Pick<ErpDocument, "id" | "doc_type">) =>
  doc.doc_type === "production" ? `/erp/preps/batch/${doc.id}` : `/erp/documents/${doc.id}`;

export function useDocuments(types: ErpDocType[] | null) {
  const [documents, setDocuments] = useState<ErpDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = types?.join(",") ?? "";

  const load = useCallback(async () => {
    setDocuments(null);
    setError(null);
    try {
      const single = types && types.length === 1 ? `?type=${types[0]}` : "";
      const response = await fetch(`/api/erp/documents${single}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "server");
      const list = data.documents as ErpDocument[];
      setDocuments(types && types.length > 1 ? list.filter((doc) => types.includes(doc.doc_type)) : list);
    } catch (e) {
      setError(errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { documents, error, reload: load };
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "draft";
  return <span className={`erpBadge ${s === "posted" ? "ok" : s === "cancelled" ? "bad" : ""}`}>{statusLabel(s)}</span>;
}

function describe(state: ErpState, doc: ErpDocument): ReactNode {
  const supplier = state.suppliers.find((s) => s.id === doc.supplier_id)?.name;
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
    case "writeoff":
      return `${warehouseName(state, doc.warehouse_id)}${doc.reason ? ` · ${doc.reason}` : ""}`;
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
}: {
  state: ErpState;
  documents: ErpDocument[] | null;
  error: string | null;
  reload: () => void;
  showType?: boolean;
  empty: ReactNode;
}) {
  const router = useRouter();
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
    </div>
  );
}
