"use client";

import { useEffect, useMemo, useState } from "react";
import { useErpRouter } from "./erpHref";
import type { VatDeductionStatus } from "@/lib/erp/purchaseVat";
import type { VatAdjustmentReason } from "@/lib/erp/vatCostAdjustment";
import { useErp } from "./ErpShell";
import { Empty, Field, loadingText, NavLink, NumberInput, PageHead, T, today, vnd } from "./ui";

const REASONS: { value: VatAdjustmentReason; label: string }[] = [
  { value: "vat_invoice_received", label: "VAT Invoice Received" },
  { value: "vat_deduction_confirmed", label: "VAT Deduction Confirmed" },
  { value: "partial_vat_deduction_confirmed", label: "Partial VAT Deduction Confirmed" },
  { value: "vat_deduction_rejected", label: "VAT Deduction Rejected" },
  { value: "vat_deduction_reversed", label: "VAT Deduction Reversed" },
  { value: "accounting_correction", label: "Accounting Correction" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: VatDeductionStatus; label: string }[] = [
  { value: "deductible", label: "Deductible" },
  { value: "partial", label: "Partially Deductible" },
  { value: "non_deductible", label: "Non-Deductible" },
  { value: "pending", label: "Pending" },
];

type Preview = {
  previous?: {
    status?: string;
    deductible_vat_amount?: number;
    effective_inventory_cost?: number;
    deductible_vat_pct?: number | null;
  };
  new_vat_deduction_status?: string;
  new_deductible_vat_pct?: number | null;
  new_deductible_vat_amount?: number;
  new_effective_inventory_cost?: number;
  vat_deduction_difference?: number;
  total_cost_adjustment?: number;
  previous_unit_cost?: number;
  new_unit_cost?: number;
  remaining_inventory_adjustment?: number;
  consumed_cost_adjustment?: number;
  write_off_adjustment?: number;
  unallocated_adjustment?: number;
  remaining_qty?: number;
  consumed_qty?: number;
  original_qty?: number;
  warnings?: string[];
  preview_hash?: string;
  source_document_id?: string;
  source_line_id?: string;
};

export function VatAdjustmentEditor({
  sourceLineId,
  sourceDocumentId,
}: {
  sourceLineId: string;
  sourceDocumentId?: string | null;
}) {
  const router = useErpRouter();
  const { act, busy, state } = useErp();
  const [reason, setReason] = useState<VatAdjustmentReason>("vat_deduction_confirmed");
  const [reasonNote, setReasonNote] = useState("");
  const [newStatus, setNewStatus] = useState<VatDeductionStatus>("deductible");
  const [newPct, setNewPct] = useState<number | null>(50);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [adjDate, setAdjDate] = useState(today());
  const [confirmBackdated, setConfirmBackdated] = useState(false);
  const [supportUrl, setSupportUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjId, setAdjId] = useState<string | null>(null);
  const backdated = adjDate < today();
  const allowBackdated = Boolean(state?.settings?.vat_adj_allow_backdated);

  const payload = useMemo(
    () => ({
      source_line_id: sourceLineId,
      new_vat_deduction_status: newStatus,
      new_deductible_vat_pct: newStatus === "partial" ? newPct : null,
      reason,
      reason_note: reasonNote || null,
      vat_invoice_number: invoiceNo || null,
      vat_invoice_date: invoiceDate || null,
      supporting_document_url: supportUrl || null,
      adj_date: adjDate,
      confirm_backdated: backdated ? confirmBackdated : false,
    }),
    [sourceLineId, newStatus, newPct, reason, reasonNote, invoiceNo, invoiceDate, supportUrl, adjDate, backdated, confirmBackdated],
  );

  const refreshPreview = async () => {
    setError(null);
    const result = await act<{ preview: Preview }>(
      { action: "previewVatAdjustment", preview: payload },
      false,
    );
    if (result?.preview) setPreview(result.preview);
  };

  useEffect(() => {
    void refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceLineId, newStatus, newPct]);

  const saveAndPost = async () => {
    if (!preview) return;
    if (
      !window.confirm(
        T(
          "Провести корректировку НДС? Количество на складе не изменится.",
          "Post Input VAT adjustment? Stock quantity will not change.",
          "Ghi điều chỉnh VAT? Số lượng tồn không đổi.",
        ),
      )
    ) {
      return;
    }
    setError(null);
    const fresh = await act<{ preview: Preview }>({ action: "previewVatAdjustment", preview: payload }, false);
    if (!fresh?.preview) return;
    if (preview.preview_hash && fresh.preview.preview_hash !== preview.preview_hash) {
      setPreview(fresh.preview);
      setError(
        T(
          "Остатки или статус изменились — проверьте новый расчёт и подтвердите снова.",
          "Stock or status changed — review the new preview and confirm again.",
          "Tồn kho/trạng thái đã đổi — xem lại và xác nhận lại.",
        ),
      );
      return;
    }
    const saved = await act<{ id: string }>(
      { action: "saveVatAdjustment", adjustment: { ...payload, preview_hash: fresh.preview.preview_hash } },
      T("Черновик корректировки сохранён", "Adjustment draft saved", "Đã lưu nháp điều chỉnh"),
    );
    if (!saved?.id) return;
    setAdjId(saved.id);
    const posted = await act(
      { action: "postVatAdjustment", id: saved.id, previewHash: fresh.preview.preview_hash },
      T("Корректировка НДС проведена", "VAT adjustment posted", "Đã ghi điều chỉnh VAT"),
    );
    if (posted) router.push(sourceDocumentId ? `/erp/documents/${sourceDocumentId}` : "/erp/stock/vat-adjustments");
  };

  if (error && !preview) {
    return <Empty kind="error" title={T("Не удалось рассчитать", "Could not preview", "Không xem trước được")} text={error} />;
  }

  return (
    <>
      <NavLink href={sourceDocumentId ? `/erp/documents/${sourceDocumentId}` : "/erp/stock/receipts"} className="erpBack">
        ← {T("К поставке", "Back to delivery", "Về phiếu nhập")}
      </NavLink>
      <PageHead
        title={T("Корректировка входящего НДС", "Input VAT Adjustment", "Điều chỉnh VAT đầu vào")}
        sub={T("Документированное изменение статуса вычета без переписывания поставки.", "Documented deduction-status change without rewriting the receipt.", "Đổi trạng thái khấu trừ có chứng từ, không sửa phiếu nhập.")}
      />

      <section className="erpCard">
        <h2>{T("Параметры", "Parameters", "Tham số")}</h2>
        <div className="erpFormGrid">
          <Field label={T("Причина *", "Reason *", "Lý do *")}>
            <select value={reason} onChange={(e) => setReason(e.target.value as VatAdjustmentReason)} data-testid="vat-adj-reason">
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T("Новый статус вычета *", "New deduction status *", "Trạng thái khấu trừ mới *")}>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as VatDeductionStatus)} data-testid="vat-adj-status">
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          {newStatus === "partial" ? (
            <Field label={T("% вычета", "Deductible %", "% khấu trừ")}>
              <NumberInput value={newPct} onChange={setNewPct} />
            </Field>
          ) : null}
          <Field label={T("Номер налоговой накладной", "VAT Invoice Number", "Số HĐ VAT")}>
            <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
          <Field label={T("Дата накладной", "VAT Invoice Date", "Ngày HĐ")}>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label={T("Дата корректировки", "Adjustment date", "Ngày điều chỉnh")}>
            <input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} data-testid="vat-adj-date" />
          </Field>
          {backdated && !allowBackdated ? (
            <div className="erpNotice warn" style={{ gridColumn: "1 / -1" }} data-testid="vat-adj-backdated-disabled">
              {T(
                "Корректировки задним числом отключены в настройках (по умолчанию). Полное закрытие периодов — Release 3. Checkbox подтверждения недостаточен.",
                "Backdated adjustments are disabled in settings (default). Full period close is Release 3. A confirmation checkbox alone is not enough.",
                "Điều chỉnh lùi ngày đang tắt trong cài đặt (mặc định). Khoá kỳ = Release 3.",
              )}
            </div>
          ) : null}
          {backdated && allowBackdated ? (
            <label className="erpCheck" style={{ gridColumn: "1 / -1" }}>
              <input type="checkbox" checked={confirmBackdated} onChange={(e) => setConfirmBackdated(e.target.checked)} data-testid="vat-adj-backdated" />
              {T(
                "Подтверждаю проведение задним числом; укажите причину в комментарии (аудит)",
                "I confirm backdated posting; enter a reason note (audited)",
                "Xác nhận ghi lùi ngày; ghi lý do (được audit)",
              )}
            </label>
          ) : null}
          <Field label={T("Подтверждающий документ", "Supporting document", "Tài liệu hỗ trợ")} wide>
            <input value={supportUrl} placeholder="https://…" onChange={(e) => setSupportUrl(e.target.value)} />
          </Field>
          <Field label={T("Комментарий", "Note", "Ghi chú")} wide>
            <input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="erpCard" data-testid="vat-adj-preview">
        <h2>{T("Предварительный расчёт", "Preview", "Xem trước")}</h2>
        {!preview ? (
          <div className="erpLoading">{loadingText()}</div>
        ) : (
          <>
            <div className="erpFormGrid">
              <Field label={T("Было / статус", "Previous status", "Trạng thái cũ")}>
                <input value={preview.previous?.status ?? "—"} readOnly disabled />
              </Field>
              <Field label={T("Станет", "New status", "Mới")}>
                <input value={preview.new_vat_deduction_status ?? "—"} readOnly disabled />
              </Field>
              <Field label={T("Себестоимость было", "Previous inventory cost", "Giá vốn cũ")}>
                <input value={vnd(preview.previous?.effective_inventory_cost)} readOnly disabled />
              </Field>
              <Field label={T("Себестоимость станет", "New inventory cost", "Giá vốn mới")}>
                <input value={vnd(preview.new_effective_inventory_cost)} readOnly disabled />
              </Field>
              <Field label={T("Цена ед. было", "Previous unit cost", "Đơn giá cũ")}>
                <input value={vnd(preview.previous_unit_cost)} readOnly disabled />
              </Field>
              <Field label={T("Цена ед. станет", "New unit cost", "Đơn giá mới")}>
                <input value={vnd(preview.new_unit_cost)} readOnly disabled />
              </Field>
              <Field label={T("Δ вычета НДС", "VAT deduction difference", "Chênh khấu trừ VAT")}>
                <input value={vnd(preview.vat_deduction_difference)} readOnly disabled />
              </Field>
              <Field label={T("Корректировка себестоимости", "Inventory cost adjustment", "Điều chỉnh giá vốn")}>
                <input value={vnd(preview.total_cost_adjustment)} readOnly disabled />
              </Field>
              <Field label={T("Остаток на складе", "Remaining inventory adj.", "Điều chỉnh tồn")}>
                <input value={`${vnd(preview.remaining_inventory_adjustment)} · ${preview.remaining_qty ?? 0} / ${preview.original_qty ?? 0}`} readOnly disabled />
              </Field>
              <Field label={T("Использовано", "Consumed cost adj.", "Đã dùng")}>
                <input value={`${vnd(preview.consumed_cost_adjustment)} · ${preview.consumed_qty ?? 0}`} readOnly disabled />
              </Field>
              <Field label={T("Списания", "Write-off adj.", "Xuất hủy")}>
                <input value={vnd(preview.write_off_adjustment)} readOnly disabled />
              </Field>
              <Field label={T("Нераспределено", "Unallocated", "Chưa phân bổ")}>
                <input value={vnd(preview.unallocated_adjustment)} readOnly disabled />
              </Field>
            </div>
            {preview.warnings?.length ? (
              <div className="erpNotice warn" data-testid="vat-adj-warnings">
                <ul>
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <p>
                  {T(
                    "Unallocated Adjustment не списывается автоматически в P&L/COGS — только явное распределение или Phase 8E lineage.",
                    "Unallocated Adjustment is never auto-posted to P&L/COGS — only explicit assignment or Phase 8E lineage.",
                    "Unallocated không tự vào P&L/COGS — chỉ phân bổ thủ công hoặc lineage 8E.",
                  )}
                </p>
              </div>
            ) : null}
          </>
        )}
        {error ? <div className="erpNotice warn">{error}</div> : null}
        <div className="erpActions">
          <button type="button" className="erpBtn ghost" disabled={busy} onClick={() => void refreshPreview()}>
            {T("Пересчитать", "Recalculate", "Tính lại")}
          </button>
          <button type="button" className="erpBtn primary" disabled={busy || !preview} onClick={() => void saveAndPost()} data-testid="vat-adj-post">
            {T("Провести корректировку", "Post adjustment", "Ghi điều chỉnh")}
          </button>
        </div>
        {adjId ? <p className="erpHint">ID: {adjId}</p> : null}
      </section>
    </>
  );
}
