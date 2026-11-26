"use client";

import { useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { PageHead, T, vnd } from "./ui";

export function FinanceOutputVatPage() {
  const { state } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const { from, to } = monthRange(month);
  const channels = state?.channels ?? [];
  const locations = state?.locations ?? [];

  const rows = useMemo(() => {
    return (state?.salesDocuments ?? []).filter((d) => {
      if (!["posted", "partially_refunded", "refunded"].includes(String(d.order_status))) return false;
      return d.business_date >= from && d.business_date <= to;
    });
  }, [state?.salesDocuments, from, to]);

  const totals = useMemo(() => {
    let taxable = 0;
    let vat = 0;
    for (const r of rows) {
      taxable += Number(r.taxable_amount ?? 0);
      vat += Number(r.output_vat_amount ?? 0);
    }
    return { taxable, vat };
  }, [rows]);

  const channelName = (id?: string | null) => channels.find((c) => c.id === id)?.name ?? "—";
  const locationName = (id?: string | null) => locations.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Исходящий НДС", "Output VAT", "VAT đầu ra")}
        sub={T(
          "Налоговый регистр по проведённым продажам (snapshot ставки). Не пересчитывается при смене глобальной ставки.",
          "Tax register from posted sales (rate snapshot). Global rate changes do not rewrite history.",
          "Sổ VAT từ bán đã ghi (snapshot thuế). Đổi thuế toàn cục không tính lại lịch sử.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.outputVat} />
      <div className="erpFinancePeriod">
        <label>
          {T("Период", "Period", "Kỳ")}{" "}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      <div className="erpFinanceTotals">
        <div>
          <span>{T("Налоговая база", "Taxable base", "Căn cứ thuế")}</span>
          <strong>{vnd(totals.taxable)}</strong>
        </div>
        <div>
          <span>{T("Сумма Output VAT", "Output VAT amount", "VAT đầu ra")}</span>
          <strong>{vnd(totals.vat)}</strong>
        </div>
      </div>
      <section className="erpMenuPanel">
        <div className="erpTableWrap erpMenuWrap">
          <table className="erpTable erpMenuTable" data-testid="output-vat-register">
            <thead>
              <tr>
                <th>{T("Дата", "Date", "Ngày")}</th>
                <th>{T("Канал", "Channel", "Kênh")}</th>
                <th>{T("Подразделение", "Location", "Điểm")}</th>
                <th>{T("Ставка", "Rate", "%")}</th>
                <th>{T("Источник ставки", "Rate source", "Nguồn thuế")}</th>
                <th className="num">{T("База", "Base", "Căn cứ")}</th>
                <th className="num">VAT</th>
                <th>{T("Статус", "Status", "TT")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>{T("Нет проведённых продаж за период", "No posted sales in period", "Không có bán trong kỳ")}</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a className="erpLink" href={`/erp/finance/sales/${r.id}`}>
                        {r.business_date}
                      </a>
                    </td>
                    <td>{channelName(r.sales_channel_id)}</td>
                    <td>{locationName(r.business_location_id)}</td>
                    <td>{r.output_vat_rate ?? "—"}</td>
                    <td>{r.output_vat_rate_source ?? "—"}</td>
                    <td className="num">{vnd(r.taxable_amount ?? null)}</td>
                    <td className="num">{vnd(r.output_vat_amount ?? null)}</td>
                    <td>{r.order_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
