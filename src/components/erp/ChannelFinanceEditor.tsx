"use client";

import { useMemo, useState } from "react";
import { advertisingRateForScenario, splitRateWithVat } from "@/lib/erp/channelFinance";
import type { ErpChannel } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { Field, NumberInput, T, useDirtyGuard } from "./ui";

const CALC_BASES: [string, string, string, string][] = [
  ["gross_sales_after_merchant_discounts", "Gross sales after merchant discounts", "Doanh thu gộp sau CK merchant", "Выручка gross после скидок ресторана"],
  ["gross_sales", "Gross sales", "Doanh thu gộp", "Выручка gross"],
  ["net_sales", "Net sales", "Doanh thu net", "Выручка net"],
  ["net_revenue", "Net revenue", "Doanh thu thuần", "Чистая выручка"],
];

const DEDUCTION: [string, string, string, string][] = [
  ["pending", "Pending", "Chờ xác nhận", "Pending"],
  ["deductible", "Deductible", "Được khấu trừ", "Вычитаемый"],
  ["partial", "Partial", "Một phần", "Частично"],
  ["non_deductible", "Non-deductible", "Không khấu trừ", "Невычитаемый"],
];

const SCENARIOS: [string, string, string, string][] = [
  ["organic", "Organic 0%", "Organic 0%", "Organic 0%"],
  ["standard", "Standard", "Standard", "Standard"],
  ["full", "Full", "Full", "Full"],
  ["custom", "Custom", "Tuỳ chỉnh", "Свой %"],
];

function label(row: [string, string, string, string]) {
  return T(row[3], row[1], row[2]);
}

function bool(v: unknown, fallback = false) {
  return v === true || v === "true" ? true : v === false || v === "false" ? false : fallback;
}

function draftOf(channel: ErpChannel): Record<string, unknown> {
  return {
    name: channel.name,
    commission_pct: channel.commission_pct,
    legacy_commission_pct: channel.legacy_commission_pct ?? channel.commission_pct,
    output_vat_rate: channel.output_vat_rate ?? 8,
    selling_price_includes_vat: channel.selling_price_includes_vat ?? true,
    finance_preliminary: channel.finance_preliminary ?? false,
    commission_enabled: channel.commission_enabled ?? false,
    commission_rate: channel.commission_rate,
    commission_vat_included: channel.commission_vat_included ?? false,
    commission_vat_rate: channel.commission_vat_rate ?? 8,
    commission_calc_base: channel.commission_calc_base ?? "gross_sales_after_merchant_discounts",
    commission_vat_deduction_status: channel.commission_vat_deduction_status ?? "pending",
    commission_deductible_vat_pct: channel.commission_deductible_vat_pct,
    advertising_enabled: channel.advertising_enabled ?? false,
    advertising_scenario: channel.advertising_scenario ?? "custom",
    advertising_rate: channel.advertising_rate,
    advertising_vat_included: channel.advertising_vat_included ?? false,
    advertising_vat_rate: channel.advertising_vat_rate ?? 8,
    advertising_calc_base: channel.advertising_calc_base ?? "gross_sales_after_merchant_discounts",
    advertising_vat_deduction_status: channel.advertising_vat_deduction_status ?? "pending",
    advertising_deductible_vat_pct: channel.advertising_deductible_vat_pct,
    advertising_organic_gross_pct: channel.advertising_organic_gross_pct ?? 0,
    advertising_standard_gross_pct: channel.advertising_standard_gross_pct,
    advertising_full_gross_pct: channel.advertising_full_gross_pct,
    merchant_discounts_enabled: channel.merchant_discounts_enabled ?? false,
    platform_fees_enabled: channel.platform_fees_enabled ?? false,
    chargebacks_enabled: channel.chargebacks_enabled ?? false,
    financial_adjustments_enabled: channel.financial_adjustments_enabled ?? false,
    additional_expenses_note: channel.additional_expenses_note ?? "",
    min_margin_pct: channel.min_margin_pct,
    target_margin_pct: channel.target_margin_pct,
    optimal_margin_pct: channel.optimal_margin_pct,
  };
}

function ChannelCard({ channel }: { channel: ErpChannel }) {
  const { act, busy } = useErp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftOf(channel));
  const baseline = useMemo(() => JSON.stringify(draftOf(channel)), [channel]);
  const dirty = JSON.stringify(draft) !== baseline;
  useDirtyGuard(dirty && open);

  const set = (key: string, value: unknown) => setDraft((prev) => ({ ...prev, [key]: value }));

  const commissionSplit = splitRateWithVat(
    draft.commission_rate as number | null,
    draft.commission_vat_rate as number | null,
    bool(draft.commission_vat_included),
  );
  const adsRate = advertisingRateForScenario({
    advertising_scenario: String(draft.advertising_scenario ?? "custom"),
    advertising_rate: draft.advertising_rate as number | null,
    advertising_organic_gross_pct: draft.advertising_organic_gross_pct as number | null,
    advertising_standard_gross_pct: draft.advertising_standard_gross_pct as number | null,
    advertising_full_gross_pct: draft.advertising_full_gross_pct as number | null,
  });
  const adsSplit = splitRateWithVat(adsRate, draft.advertising_vat_rate as number | null, bool(draft.advertising_vat_included));

  const missingFinance =
    bool(draft.commission_enabled) && draft.commission_rate == null && draft.commission_pct == null
      ? T(
          "Не задана комиссия — расчёт маржи будет неполным.",
          "Commission not set — margin calculation will be incomplete.",
          "Chưa có hoa hồng — tính biên lợi nhuận sẽ thiếu.",
        )
      : null;

  const save = async () => {
    const result = await act(
      {
        action: "saveRef",
        entity: "channel",
        value: { id: channel.id, ...draft },
      },
      T("Канал сохранён", "Channel saved", "Đã lưu kênh"),
    );
    if (result) setDraft(draftOf({ ...channel, ...draft } as ErpChannel));
  };

  return (
    <div className="erpCard" data-testid={`channel-finance-${channel.code}`}>
      <div className="erpRow" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <strong>{channel.name}</strong>
          <div className="erpHint">
            {T("Legacy комиссия", "Legacy commission", "Hoa hồng legacy")}:{" "}
            {channel.commission_pct == null ? "—" : `${channel.commission_pct}%`}
            {bool(draft.finance_preliminary) ? (
              <span className="erpBadge warn" style={{ marginLeft: 8 }}>
                {T("Preliminary", "Preliminary", "Tạm thời")}
              </span>
            ) : null}
          </div>
        </div>
        <button type="button" className="erpBtn" onClick={() => setOpen((v) => !v)}>
          {open ? T("Свернуть", "Collapse", "Thu gọn") : T("Настройки", "Settings", "Cài đặt")}
        </button>
      </div>

      {open ? (
        <div className="erpStack" style={{ marginTop: 12 }}>
          {missingFinance ? (
            <p className="erpBanner warn" role="status">
              {missingFinance}
            </p>
          ) : null}

          <h3>{T("Sales VAT", "Sales VAT", "VAT bán hàng")}</h3>
          <div className="erpGrid two">
            <Field label={T("Output VAT, %", "Output VAT, %", "VAT đầu ra, %")}>
              <NumberInput value={(draft.output_vat_rate as number) ?? null} onChange={(v) => set("output_vat_rate", v)} />
            </Field>
            <Field label={T("Цена включает НДС", "Selling price includes VAT", "Giá đã gồm VAT")}>
              <label className="erpCheck">
                <input
                  type="checkbox"
                  checked={bool(draft.selling_price_includes_vat, true)}
                  onChange={(e) => set("selling_price_includes_vat", e.target.checked)}
                />
                {T("Да", "Yes", "Có")}
              </label>
            </Field>
            <Field label={T("Preliminary параметры", "Preliminary parameters", "Tham số tạm")}>
              <label className="erpCheck">
                <input
                  type="checkbox"
                  checked={bool(draft.finance_preliminary)}
                  onChange={(e) => set("finance_preliminary", e.target.checked)}
                />
                {T("Не подтверждены договором", "Not contract-confirmed", "Chưa xác nhận hợp đồng")}
              </label>
            </Field>
          </div>

          <h3>{T("Комиссия", "Commission", "Hoa hồng")}</h3>
          <div className="erpGrid two">
            <Field label={T("Включена", "Enabled", "Bật")}>
              <label className="erpCheck">
                <input type="checkbox" checked={bool(draft.commission_enabled)} onChange={(e) => set("commission_enabled", e.target.checked)} />
              </label>
            </Field>
            <Field
              label={
                bool(draft.commission_vat_included)
                  ? T("Ставка gross, %", "Gross rate, %", "Tỷ lệ gộp, %")
                  : T("Ставка net, %", "Net rate, %", "Tỷ lệ net, %")
              }
            >
              <NumberInput value={(draft.commission_rate as number) ?? null} onChange={(v) => set("commission_rate", v)} />
            </Field>
            <Field label={T("Ставка уже с НДС", "Rate includes VAT", "Tỷ lệ đã gồm VAT")}>
              <label className="erpCheck">
                <input
                  type="checkbox"
                  checked={bool(draft.commission_vat_included)}
                  onChange={(e) => set("commission_vat_included", e.target.checked)}
                />
              </label>
            </Field>
            <Field label={T("НДС комиссии, %", "Commission VAT, %", "VAT hoa hồng, %")}>
              <NumberInput value={(draft.commission_vat_rate as number) ?? null} onChange={(v) => set("commission_vat_rate", v)} />
            </Field>
            <Field label={T("База расчёта", "Calculation base", "Cơ sở tính")}>
              <select value={String(draft.commission_calc_base ?? "")} onChange={(e) => set("commission_calc_base", e.target.value)}>
                {CALC_BASES.map((row) => (
                  <option key={row[0]} value={row[0]}>
                    {label(row)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T("Статус вычета НДС", "VAT deduction status", "Trạng thái khấu trừ VAT")}>
              <select
                value={String(draft.commission_vat_deduction_status ?? "pending")}
                onChange={(e) => set("commission_vat_deduction_status", e.target.value)}
              >
                {DEDUCTION.map((row) => (
                  <option key={row[0]} value={row[0]}>
                    {label(row)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T("Вычитаемый НДС, %", "Deductible VAT, %", "VAT được khấu trừ, %")}>
              <NumberInput
                value={(draft.commission_deductible_vat_pct as number) ?? null}
                onChange={(v) => set("commission_deductible_vat_pct", v)}
              />
            </Field>
            <Field label={T("Расчёт net / gross (только показ)", "Computed net / gross (read-only)", "Net / gộp (chỉ xem)")}>
              <span className="erpHint">
                net {commissionSplit.net == null ? "—" : commissionSplit.net.toFixed(4)}% · gross{" "}
                {commissionSplit.gross == null ? "—" : commissionSplit.gross.toFixed(4)}%
              </span>
            </Field>
            <Field
              label={T("Legacy Rate (commission_pct)", "Legacy Rate (commission_pct)", "Legacy Rate (commission_pct)")}
              hint={T(
                "Старое поле для текущей калькуляции маржи до Phase 6. Не авто-сплиттится.",
                "Legacy field for current margin calc until Phase 6. Not auto-split.",
                "Trường cũ cho biên LN đến Phase 6. Không tách tự động.",
              )}
            >
              <NumberInput value={(draft.commission_pct as number) ?? null} onChange={(v) => set("commission_pct", v)} />
            </Field>
          </div>

          <h3>{T("Реклама", "Advertising", "Quảng cáo")}</h3>
          <div className="erpGrid two">
            <Field label={T("Включена", "Enabled", "Bật")}>
              <label className="erpCheck">
                <input type="checkbox" checked={bool(draft.advertising_enabled)} onChange={(e) => set("advertising_enabled", e.target.checked)} />
              </label>
            </Field>
            <Field label={T("Сценарий", "Scenario", "Kịch bản")}>
              <select value={String(draft.advertising_scenario ?? "custom")} onChange={(e) => set("advertising_scenario", e.target.value)}>
                {SCENARIOS.map((row) => (
                  <option key={row[0]} value={row[0]}>
                    {label(row)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T("Organic gross, %", "Organic gross, %", "Organic gộp, %")}>
              <NumberInput
                value={(draft.advertising_organic_gross_pct as number) ?? null}
                onChange={(v) => set("advertising_organic_gross_pct", v)}
              />
            </Field>
            <Field label={T("Standard gross, %", "Standard gross, %", "Standard gộp, %")}>
              <NumberInput
                value={(draft.advertising_standard_gross_pct as number) ?? null}
                onChange={(v) => set("advertising_standard_gross_pct", v)}
              />
            </Field>
            <Field label={T("Full gross, %", "Full gross, %", "Full gộp, %")}>
              <NumberInput value={(draft.advertising_full_gross_pct as number) ?? null} onChange={(v) => set("advertising_full_gross_pct", v)} />
            </Field>
            <Field label={T("Custom / active rate, %", "Custom / active rate, %", "Tỷ lệ custom, %")}>
              <NumberInput value={(draft.advertising_rate as number) ?? null} onChange={(v) => set("advertising_rate", v)} />
            </Field>
            <Field label={T("Ставка уже с НДС", "Rate includes VAT", "Tỷ lệ đã gồm VAT")}>
              <label className="erpCheck">
                <input
                  type="checkbox"
                  checked={bool(draft.advertising_vat_included)}
                  onChange={(e) => set("advertising_vat_included", e.target.checked)}
                />
              </label>
            </Field>
            <Field label={T("НДС рекламы, %", "Advertising VAT, %", "VAT quảng cáo, %")}>
              <NumberInput value={(draft.advertising_vat_rate as number) ?? null} onChange={(v) => set("advertising_vat_rate", v)} />
            </Field>
            <Field label={T("Статус вычета НДС", "VAT deduction status", "Trạng thái khấu trừ VAT")}>
              <select
                value={String(draft.advertising_vat_deduction_status ?? "pending")}
                onChange={(e) => set("advertising_vat_deduction_status", e.target.value)}
              >
                {DEDUCTION.map((row) => (
                  <option key={row[0]} value={row[0]}>
                    {label(row)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T("Расчёт net / gross (только показ)", "Computed net / gross (read-only)", "Net / gộp (chỉ xem)")}>
              <span className="erpHint">
                active {adsRate == null ? "—" : `${adsRate}%`} · net {adsSplit.net == null ? "—" : adsSplit.net.toFixed(4)}% · gross{" "}
                {adsSplit.gross == null ? "—" : adsSplit.gross.toFixed(4)}%
              </span>
            </Field>
          </div>

          <h3>{T("Доп. расходы", "Additional expenses", "Chi phí thêm")}</h3>
          <div className="erpGrid two">
            {(
              [
                ["merchant_discounts_enabled", T("Merchant discounts", "Merchant discounts", "CK merchant")],
                ["platform_fees_enabled", T("Platform fees", "Platform fees", "Phí sàn")],
                ["chargebacks_enabled", T("Chargebacks", "Chargebacks", "Chargeback")],
                ["financial_adjustments_enabled", T("Financial adjustments", "Financial adjustments", "Điều chỉnh TC")],
              ] as const
            ).map(([key, title]) => (
              <Field key={key} label={title}>
                <label className="erpCheck">
                  <input type="checkbox" checked={bool(draft[key])} onChange={(e) => set(key, e.target.checked)} />
                </label>
              </Field>
            ))}
            <Field label={T("Заметка", "Note", "Ghi chú")}>
              <input value={String(draft.additional_expenses_note ?? "")} onChange={(e) => set("additional_expenses_note", e.target.value)} />
            </Field>
          </div>

          <h3>{T("Целевая маржа", "Margin targets", "Biên LN mục tiêu")}</h3>
          <div className="erpGrid two">
            <Field label={T("Minimum, %", "Minimum, %", "Tối thiểu, %")}>
              <NumberInput value={(draft.min_margin_pct as number) ?? null} onChange={(v) => set("min_margin_pct", v)} />
            </Field>
            <Field label={T("Target, %", "Target, %", "Mục tiêu, %")}>
              <NumberInput value={(draft.target_margin_pct as number) ?? null} onChange={(v) => set("target_margin_pct", v)} />
            </Field>
            <Field label={T("Optimal, %", "Optimal, %", "Tối ưu, %")}>
              <NumberInput value={(draft.optimal_margin_pct as number) ?? null} onChange={(v) => set("optimal_margin_pct", v)} />
            </Field>
          </div>

          <div className="erpActions">
            <button type="button" className="erpBtn primary" disabled={busy || !dirty} onClick={() => void save()}>
              {T("Сохранить канал", "Save channel", "Lưu kênh")}
            </button>
            <button
              type="button"
              className="erpBtn ghost"
              disabled={!dirty}
              onClick={() => setDraft(draftOf(channel))}
            >
              {T("Отменить", "Discard", "Hủy")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChannelFinanceEditor({ channels }: { channels: ErpChannel[] }) {
  const active = channels.filter((row) => !row.archived_at);
  if (!active.length) {
    return (
      <p className="erpHint">
        {T("Каналов продаж пока нет.", "No sales channels yet.", "Chưa có kênh bán.")}
      </p>
    );
  }
  return (
    <div className="erpStack" data-testid="channel-finance-editor">
      <p className="erpHint">
        {T(
          "Новые поля комиссии/рекламы сохраняются в истории. Текущая маржа на карточке блюда до Phase 6 по-прежнему использует Legacy Rate (commission_pct). Вычисляемые net/gross не редактируются отдельно.",
          "New commission/ads fields are versioned. Dish margin until Phase 6 still uses Legacy Rate (commission_pct). Computed net/gross are read-only.",
          "Trường hoa hồng/QC mới có lịch sử. Biên LN đến Phase 6 vẫn dùng Legacy Rate. Net/gộp chỉ xem.",
        )}
      </p>
      {active.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} />
      ))}
    </div>
  );
}
