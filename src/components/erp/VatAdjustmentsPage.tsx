"use client";

import { useCallback, useEffect, useState } from "react";
import { useErp } from "./ErpShell";
import { StockMobileNav } from "./stockNav";
import { Empty, loadingText, NavLink, PageHead, T, dateText, vnd } from "./ui";

type Row = {
  id: string;
  adj_no: string;
  adj_date: string;
  status: string;
  supplier_id: string | null;
  source_document_id: string;
  product_id: string | null;
  previous_vat_deduction_status: string | null;
  new_vat_deduction_status: string;
  vat_deduction_difference: number | null;
  total_cost_adjustment: number | null;
  consumed_cost_adjustment: number | null;
  unallocated_adjustment: number | null;
  created_by: string | null;
  approved_by: string | null;
  posted_at: string | null;
};

/** Prefer client supabase via act-less select through a tiny API-less path — use erp fetch helper if present. */
async function loadRows(): Promise<Row[]> {
  const res = await fetch("/api/erp/vat-adjustments", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || res.statusText || "load failed");
  }
  const data = await res.json();
  return (data.rows ?? []) as Row[];
}

export function VatAdjustmentsPage() {
  const { state } = useErp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    loadRows()
      .then(setRows)
      .catch((e: Error) => setError(e.message || "network"));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const supplierName = (id: string | null) => state?.suppliers.find((s) => s.id === id)?.name ?? "—";
  const productName = (id: string | null) => {
    const p = state?.products.find((x) => x.id === id);
    return p ? p.name_en || p.name_vn : "—";
  };

  return (
    <>
      <PageHead
        title={T("Корректировки входящего НДС", "Input VAT Adjustments", "Điều chỉnh VAT đầu vào")}
        sub={T("Журнал документированных изменений статуса вычета и складской себестоимости.", "Journal of documented deduction-status and inventory-cost changes.", "Nhật ký đổi trạng thái khấu trừ và giá vốn.")}
      />
      <StockMobileNav active="/erp/stock/vat-adjustments" />
      {error ? (
        <Empty kind="error" title={T("Не удалось загрузить", "Could not load", "Không tải được")} text={error} />
      ) : rows == null ? (
        <div className="erpLoading">{loadingText()}</div>
      ) : !rows.length ? (
        <Empty
          title={T("Корректировок пока нет", "No adjustments yet", "Chưa có điều chỉnh")}
          text={T("Создайте корректировку из карточки проведённой поставки.", "Create an adjustment from a posted delivery card.", "Tạo từ phiếu nhập đã ghi sổ.")}
          action={
            <NavLink href="/erp/stock/receipts" className="erpBtn">
              {T("К поставкам", "Go to deliveries", "Đến nhập hàng")}
            </NavLink>
          }
        />
      ) : (
        <>
          {rows.some((r) => Number(r.unallocated_adjustment) > 0) ? (
            <div className="erpNotice warn" data-testid="unallocated-adj-warning">
              <strong>
                {T(
                  "Есть нераспределённые корректировки",
                  "Unallocated adjustments present",
                  "Có điều chỉnh chưa phân bổ",
                )}
              </strong>
              <p>
                {T(
                  "Суммы в колонке «Нерасп.» сохранены отдельно, связаны с исходной закупкой и НЕ относятся автоматически на P&L / COGS. Ручное распределение — Release 3. Произвольное редактирование сумм запрещено.",
                  "Amounts in Unalloc. stay separate, linked to the source purchase, and are NOT posted automatically to P&L / COGS. Manual allocation is Release 3. Arbitrary editing of these amounts is not allowed.",
                  "Số tiền Unalloc. giữ riêng, gắn phiếu mua, KHÔNG tự vào P&L/COGS. Phân bổ tay = Release 3.",
                )}
              </p>
            </div>
          ) : null}
          <div className="erpTableWrap">
            <table className="erpTable">
              <thead>
                <tr>
                  <th>{T("Номер", "Number", "Số")}</th>
                  <th>{T("Дата", "Date", "Ngày")}</th>
                  <th>{T("Поставщик", "Supplier", "NCC")}</th>
                  <th>{T("Продукт", "Product", "SP")}</th>
                  <th>{T("Статус НДС", "VAT status", "VAT")}</th>
                  <th className="num">{T("Δ НДС", "VAT Δ", "Δ VAT")}</th>
                  <th className="num">{T("Δ себест.", "Inv. Δ", "Δ giá vốn")}</th>
                  <th className="num">{T("Нерасп.", "Unalloc.", "Chưa PB")}</th>
                  <th>{T("Статус", "Status", "TT")}</th>
                  <th>{T("Автор", "Created by", "Tạo bởi")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const unalloc = Number(row.unallocated_adjustment) > 0;
                  return (
                    <tr key={row.id} className={unalloc ? "erpRowWarn" : undefined}>
                      <td>
                        <NavLink href={`/erp/documents/${row.source_document_id}`}>{row.adj_no}</NavLink>
                      </td>
                      <td>{dateText(row.adj_date)}</td>
                      <td>{supplierName(row.supplier_id)}</td>
                      <td>{productName(row.product_id)}</td>
                      <td>
                        {row.previous_vat_deduction_status ?? "—"} → {row.new_vat_deduction_status}
                      </td>
                      <td className="num">{vnd(row.vat_deduction_difference)}</td>
                      <td className="num">{vnd(row.total_cost_adjustment)}</td>
                      <td className="num">
                        {vnd(row.unallocated_adjustment)}
                        {unalloc ? (
                          <span className="erpBadge warn" title="Not posted to P&L/COGS">
                            Unallocated
                          </span>
                        ) : null}
                      </td>
                      <td>{row.status}</td>
                      <td>{row.created_by ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
