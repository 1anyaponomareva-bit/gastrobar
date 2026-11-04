"use client";

import { useEffect, useState } from "react";
import type { ErpDocType, ErpDocument } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { DOC_LABELS, errorText, L, productName, qtyText, STATUS_LABELS, unitOf, vnd, warehouseName } from "./ui";

const TYPES: ErpDocType[] = ["receipt", "transfer", "writeoff", "count", "opening", "production"];

export function DocumentsPage({ productionOnly }: { productionOnly?: boolean }) {
  const { state, notify } = useErp();
  const [type, setType] = useState<ErpDocType | "">(productionOnly ? "production" : "");
  const [documents, setDocuments] = useState<ErpDocument[] | null>(null);

  useEffect(() => {
    setDocuments(null);
    fetch(`/api/erp/documents${type ? `?type=${type}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "server");
        setDocuments(data.documents);
      })
      .catch((error: Error) => notify({ ok: false, text: errorText(error.message) }));
  }, [type, notify]);

  if (!state) return null;
  const supplierName = (id: string | null | undefined) => state.suppliers.find((s) => s.id === id)?.name ?? "";

  return (
    <>
      <h1>{productionOnly ? L("Production batches", "Mẻ sản xuất") : L("Documents", "Chứng từ")}</h1>
      <div className="erpToolbar">
        {(productionOnly ? (["production"] as ErpDocType[]) : TYPES).map((docType) => (
          <a key={docType} className="erpBtn primary" href={`/erp/documents/new?type=${docType}`}>
            + {DOC_LABELS[docType]}
          </a>
        ))}
      </div>
      {!productionOnly ? (
        <div className="erpTabs">
          <button type="button" className={!type ? "active" : ""} onClick={() => setType("")}>
            {L("All", "Tất cả")}
          </button>
          {TYPES.map((docType) => (
            <button key={docType} type="button" className={type === docType ? "active" : ""} onClick={() => setType(docType)}>
              {DOC_LABELS[docType]}
            </button>
          ))}
        </div>
      ) : null}
      {!documents ? (
        <div className="erpEmpty">{L("Loading…", "Đang tải…")}</div>
      ) : (
        <div className="erpTableWrap">
          <table className="erpTable">
            <thead>
              <tr>
                <th>№</th>
                <th>{L("Date", "Ngày")}</th>
                <th>{L("Type", "Loại")}</th>
                <th>{L("Details", "Chi tiết")}</th>
                <th>{L("Status", "Trạng thái")}</th>
                <th className="num">{L("Cost", "Giá vốn")}</th>
                <th>{L("Author", "Người tạo")}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className={`clickable ${doc.status === "cancelled" ? "muted" : ""}`}
                  onClick={() => (window.location.href = `/erp/documents/${doc.id}`)}
                >
                  <td>{doc.doc_no}</td>
                  <td>{doc.doc_date}</td>
                  <td>{DOC_LABELS[doc.doc_type]}</td>
                  <td>
                    {doc.doc_type === "transfer" || doc.doc_type === "production"
                      ? `${warehouseName(state, doc.warehouse_id)} → ${warehouseName(state, doc.target_warehouse_id)}`
                      : warehouseName(state, doc.warehouse_id)}
                    {doc.doc_type === "receipt" && doc.supplier_id ? ` · ${supplierName(doc.supplier_id)}` : ""}
                    {doc.doc_type === "production" && doc.output_product_id
                      ? ` · ${productName(state, doc.output_product_id)} ${qtyText(doc.output_qty, unitOf(state, doc.output_product_id))}`
                      : ""}
                    {doc.batch_no && doc.doc_type === "production" ? ` · ${doc.batch_no}` : ""}
                  </td>
                  <td>
                    <span className={`erpBadge ${doc.status === "posted" ? "ok" : doc.status === "cancelled" ? "bad" : ""}`}>
                      {STATUS_LABELS[doc.status ?? "draft"]}
                    </span>
                  </td>
                  <td className="num">
                    {doc.status !== "posted" ? "—" : doc.cost_known ? vnd(doc.total_cost) : <span className="erpBadge warn">{L("incomplete", "chưa đủ")}</span>}
                  </td>
                  <td>{doc.created_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {documents && !documents.length ? <div className="erpEmpty">{L("No documents yet", "Chưa có chứng từ")}</div> : null}
    </>
  );
}
