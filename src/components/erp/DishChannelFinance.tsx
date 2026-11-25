"use client";

import { Fragment, useMemo, useState } from "react";
import {
  advertisingScenarioOptions,
  computeDishChannelFinance,
  recommendForChannel,
  resolveDishOutputVatRate,
  type DishChannelOverrides,
  type MarginBand,
  type VatSimulationMode,
} from "@/lib/erp/dishChannelFinance";
import type { MarginTargetKind } from "@/lib/erp/financialCalculator";
import type { ErpChannel, ErpDish, ErpSettings, ErpVatException } from "@/lib/erp/types";
import { Field, NumberInput, pct, T, Tip, vnd } from "./ui";

type CostBits = { foodCost: number | null; packagingCost: number | null };

type Props = {
  channels: ErpChannel[];
  settings: ErpSettings;
  vatExceptions?: ErpVatException[] | null;
  dishId?: string | null;
  categoryId?: string | null;
  dishVatRate?: number | null;
  menuPrice: number | null;
  channelPrices: Record<string, number | null>;
  costs: CostBits;
  onChannelPrice: (channelId: string, price: number | null) => void;
  /** Compact for list previews; detailed is default on dish card. */
  defaultDetailed?: boolean;
};

type RowState = {
  open: boolean;
  adsScenario: string | null;
  vatSim: VatSimulationMode;
  partialPct: number | null;
  marginKind: MarginTargetKind;
  customMargin: number | null;
  roundTo: number;
  pendingPrice: number | null;
};

const bandClass = (band: MarginBand | null) => (band ? `erpMargin ${band}` : "erpMargin");

const bandLabel = (band: MarginBand | null) =>
  band === "critical"
    ? T("Критично", "Critical", "Nghiêm trọng")
    : band === "acceptable"
      ? T("Приемлемо", "Acceptable", "Chấp nhận được")
      : band === "good"
        ? T("Хорошо", "Good", "Tốt")
        : band === "excellent"
          ? T("Отлично", "Excellent", "Xuất sắc")
          : null;

const money = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : vnd(value));
const rate = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : `${Number(value).toFixed(2)}%`);

function RowDetail({
  view,
  state,
  setState,
  onApplyPrice,
}: {
  view: ReturnType<typeof computeDishChannelFinance>;
  state: RowState;
  setState: (patch: Partial<RowState>) => void;
  onApplyPrice: (price: number) => void;
}) {
  const r = view.result;
  const channel = view.channel;
  const adsOpts = advertisingScenarioOptions(channel);
  const rec = recommendForChannel(view, state.marginKind, state.customMargin, state.roundTo);
  const current = view.sellingPrice;
  const diff = rec.price != null && current != null ? rec.price - current : null;
  const diffPct = diff != null && current != null && current !== 0 ? (diff / current) * 100 : null;

  if (view.mode === "incomplete") {
    return (
      <div className="erpNotice warn" data-testid="channel-finance-incomplete">
        <strong>{T("Финансовые настройки неполные", "Financial Settings Incomplete", "Thiết lập tài chính chưa đủ")}</strong>
        <p className="erpHint">
          {T(
            "Задайте комиссию и рекламу канала в Служебном → Каналы продаж. Legacy Rate не смешивается с новой моделью.",
            "Set commission and advertising in Admin → Sales channels. Legacy Rate is not mixed with the new model.",
            "Thiết lập hoa hồng và quảng cáo trong Quản trị → Kênh bán. Legacy Rate không trộn với mô hình mới.",
          )}
        </p>
      </div>
    );
  }

  if (!r) return null;

  return (
    <div className="erpChannelFinanceDetail" data-testid={`channel-finance-detail-${channel.code}`}>
      {view.preliminary ? (
        <div className="erpNotice warn">
          {T(
            "Предварительные финансовые параметры канала (Preliminary). Подтвердите договорные ставки в настройках канала.",
            "Channel finance parameters are Preliminary. Confirm contract rates in channel settings.",
            "Tham số tài chính kênh là Preliminary. Xác nhận tỷ lệ hợp đồng trong cài đặt kênh.",
          )}
        </div>
      ) : null}
      {view.mode === "legacy" ? (
        <div className="erpNotice">
          <span className="erpBadge warn">Legacy Calculation</span>{" "}
          {T(
            "Используется только Legacy Rate (commission_pct). Комиссия и реклама новой модели не применяются.",
            "Using Legacy Rate (commission_pct) only. New commission/advertising model is not applied.",
            "Chỉ dùng Legacy Rate (commission_pct). Không áp dụng hoa hồng/quảng cáo mới.",
          )}
        </div>
      ) : null}

      {channel.advertising_enabled ? (
        <div className="erpToolbar erpChannelFinanceControls">
          <Field label={T("Рекламный сценарий", "Advertising scenario", "Kịch bản quảng cáo")}>
            <select
              value={state.adsScenario ?? channel.advertising_scenario ?? "standard"}
              onChange={(e) => setState({ adsScenario: e.target.value })}
              data-testid={`ads-scenario-${channel.code}`}
            >
              {adsOpts.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.rate == null && opt.value !== "organic"}>
                  {opt.value === "organic"
                    ? `Organic — ${opt.rate ?? 0}%`
                    : opt.value === "standard"
                      ? `Standard — ${opt.rate ?? "—"}%`
                      : opt.value === "full"
                        ? `Full Advertising — ${opt.rate ?? "—"}%`
                        : `Custom — ${opt.rate ?? "—"}%`}
                </option>
              ))}
            </select>
          </Field>
          <p className="erpHint">
            {T(
              "Переключение только для этой карточки блюда; глобальные настройки канала не меняются.",
              "Override applies to this dish card only; channel settings are not changed.",
              "Chỉ áp dụng cho thẻ món này; không đổi cài đặt kênh.",
            )}
          </p>
        </div>
      ) : null}

      <div className="erpToolbar erpChannelFinanceControls">
        <Field label={T("Сценарий входящего НДС", "Input VAT scenario", "Kịch bản VAT đầu vào")}>
          <select
            value={state.vatSim}
            onChange={(e) => setState({ vatSim: e.target.value as VatSimulationMode })}
            data-testid={`vat-sim-${channel.code}`}
          >
            <option value="current">{T("Текущий статус НДС", "Current VAT Status", "Trạng thái VAT hiện tại")}</option>
            <option value="full">{T("Полный вычет НДС (симуляция)", "Full VAT Deduction (Simulation)", "Khấu trừ VAT đầy đủ (mô phỏng)")}</option>
            <option value="partial">{T("Частичный вычет НДС (симуляция)", "Partial VAT Deduction (Simulation)", "Khấu trừ VAT một phần (mô phỏng)")}</option>
            <option value="none">{T("Без вычета НДС (симуляция)", "No VAT Deduction (Simulation)", "Không khấu trừ VAT (mô phỏng)")}</option>
          </select>
        </Field>
        {state.vatSim === "partial" ? (
          <Field label={T("Вычет, %", "Deductible, %", "Khấu trừ, %")}>
            <NumberInput value={state.partialPct} onChange={(v) => setState({ partialPct: v })} />
          </Field>
        ) : null}
        {view.simulation ? <span className="erpBadge warn">{T("Симуляция", "Simulation", "Mô phỏng")}</span> : null}
      </div>

      <div className="erpGrid two erpFinanceBlocks">
        <div>
          <h4>{T("Выручка", "Revenue", "Doanh thu")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>{T("Цена продажи (с НДС)", "Gross Selling Price", "Giá bán gộp")}</dt><dd>{money(r.grossSellingPrice)}</dd></div>
            <div><dt>{T("Скидка за счёт ресторана", "Merchant Discount", "Chiết khấu nhà hàng")}</dt><dd>{money(r.merchantFundedDiscount)}</dd></div>
            <div><dt>{T("Ставка исходящего НДС", "Output VAT Rate", "Thuế VAT đầu ra")}</dt><dd>{rate(r.outputVatRate)}</dd></div>
            <div><dt>{T("Сумма исходящего НДС", "Output VAT Amount", "Số tiền VAT đầu ra")}</dt><dd>{money(r.outputVatAmount)}</dd></div>
            <div><dt>{T("Выручка без НДС", "Net Revenue", "Doanh thu chưa VAT")}</dt><dd>{money(r.netRevenue)}</dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Себестоимость продукта", "Product Cost", "Giá vốn")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>{T("Food Cost", "Food Cost", "Food Cost")}</dt><dd>{money(r.foodCost)} <span className="erpCellSub">{pct(r.foodCostPct)}</span></dd></div>
            <div><dt>{T("Упаковка", "Packaging Cost", "Bao bì")}</dt><dd>{money(r.packagingCost)} <span className="erpCellSub">{pct(r.packagingCostPct)}</span></dd></div>
            <div><dt>{T("Полная себестоимость", "Total Product Cost", "Tổng giá vốn")}</dt><dd>{money(r.totalProductCost)} <span className="erpCellSub">{pct(r.totalProductCostPct)}</span></dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Комиссия платформы", "Platform Commission", "Hoa hồng sàn")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>{T("Комиссия без НДС, %", "Commission Net Rate", "Hoa hồng chưa VAT, %")}</dt><dd>{rate(r.commissionNetRate)}</dd></div>
            <div><dt>{T("НДС комиссии, %", "Commission VAT Rate", "VAT hoa hồng, %")}</dt><dd>{rate(channel.commission_vat_rate)}</dd></div>
            <div><dt>{T("Комиссия с НДС, %", "Commission Gross Rate", "Hoa hồng gồm VAT, %")}</dt><dd>{rate(r.commissionGrossRate)}</dd></div>
            <div><dt>{T("Комиссия без НДС", "Commission Net Amount", "Hoa hồng chưa VAT")}</dt><dd>{money(r.commissionNetAmount)}</dd></div>
            <div><dt>{T("НДС комиссии", "Commission VAT Amount", "VAT hoa hồng")}</dt><dd>{money(r.commissionVatAmount)}</dd></div>
            <div><dt>{T("Комиссия с НДС", "Commission Gross Amount", "Hoa hồng gồm VAT")}</dt><dd>{money(r.commissionGrossAmount)}</dd></div>
            <div><dt>{T("Возмещаемый НДС", "Deductible VAT", "VAT được khấu trừ")}</dt><dd>{money(r.deductibleCommissionVat)}</dd></div>
            <div><dt>{T("Эффективный расход на комиссию", "Effective Commission Expense", "Chi phí hoa hồng hiệu dụng")}</dt><dd>{money(r.effectiveCommissionExpense)}</dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Реклама", "Advertising", "Quảng cáo")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>{T("Сценарий рекламы", "Advertising Scenario", "Kịch bản quảng cáo")}</dt><dd>{r.advertisingScenario ?? "—"}</dd></div>
            <div><dt>{T("Реклама с НДС, %", "Advertising Gross Rate", "Quảng cáo gồm VAT, %")}</dt><dd>{rate(r.advertisingGrossRate)}</dd></div>
            <div><dt>{T("НДС рекламы, %", "Advertising VAT Rate", "VAT quảng cáo, %")}</dt><dd>{rate(channel.advertising_vat_rate)}</dd></div>
            <div><dt>{T("Реклама без НДС", "Advertising Net Amount", "Quảng cáo chưa VAT")}</dt><dd>{money(r.advertisingNetAmount)}</dd></div>
            <div><dt>{T("НДС рекламы", "Advertising VAT Amount", "VAT quảng cáo")}</dt><dd>{money(r.advertisingVatAmount)}</dd></div>
            <div><dt>{T("Реклама с НДС", "Advertising Gross Amount", "Quảng cáo gồm VAT")}</dt><dd>{money(r.advertisingGrossAmount)}</dd></div>
            <div><dt>{T("Возмещаемый НДС", "Deductible VAT", "VAT được khấu trừ")}</dt><dd>{money(r.deductibleAdvertisingVat)}</dd></div>
            <div><dt>{T("Эффективный расход на рекламу", "Effective Advertising Expense", "Chi phí quảng cáo hiệu dụng")}</dt><dd>{money(r.effectiveAdvertisingExpense)}</dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Финансовый результат", "Financial Results", "Kết quả tài chính")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>{T("Расходы канала всего", "Total Channel Expenses", "Tổng chi phí kênh")}</dt><dd>{money(r.totalChannelExpenses)}</dd></div>
            <div><dt>{T("Переменные расходы всего", "Total Variable Expenses", "Tổng chi phí biến đổi")}</dt><dd>{money(r.totalVariableExpenses)}</dd></div>
            <div>
              <dt>
                {T("Прогноз выплаты платформы", "Estimated Platform Payout", "Dự báo thanh toán sàn")}{" "}
                <Tip>
                  {T(
                    "Прогноз выплаты агрегатора, не чистая прибыль и не выручка без НДС.",
                    "Forecast aggregator payout — not net profit and not net revenue.",
                    "Dự báo thanh toán sàn — không phải lợi nhuận ròng hay doanh thu chưa VAT.",
                  )}
                </Tip>
              </dt>
              <dd>{money(r.estimatedPlatformPayout)}</dd>
            </div>
            <div>
              <dt>{T("Маржа вклада (CM)", "Contribution Margin", "Contribution Margin")}</dt>
              <dd className={bandClass(view.band)}>
                {r.complete ? (
                  <>
                    {money(r.contributionMargin)}
                    <span className="erpCellSub">{pct(r.contributionMarginPct)}</span>
                    {bandLabel(view.band) ? <span className={`erpBadge ${view.band === "critical" ? "bad" : view.band === "acceptable" ? "warn" : "ok"}`}>{bandLabel(view.band)}</span> : null}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="erpCard soft erpRecommendBox" data-testid={`recommend-${channel.code}`}>
        <h4>{T("Рекомендуемая цена продажи", "Recommended Selling Price", "Giá bán đề xuất")}</h4>
        <div className="erpToolbar erpChannelFinanceControls">
          <Field label={T("Цель маржи", "Margin target", "Mục tiêu biên")}>
            <select value={state.marginKind} onChange={(e) => setState({ marginKind: e.target.value as MarginTargetKind })}>
              <option value="minimum">{T("Минимальная маржа", "Minimum Margin", "Biên tối thiểu")} ({rate(channel.min_margin_pct)})</option>
              <option value="target">{T("Целевая маржа", "Target Margin", "Biên mục tiêu")} ({rate(channel.target_margin_pct)})</option>
              <option value="optimal">{T("Оптимальная маржа", "Optimal Margin", "Biên tối ưu")} ({rate(channel.optimal_margin_pct)})</option>
              <option value="custom">{T("Своя маржа", "Custom Margin", "Biên tùy chỉnh")}</option>
            </select>
          </Field>
          {state.marginKind === "custom" ? (
            <Field label={T("Своя, %", "Custom, %", "Tùy chỉnh, %")}>
              <NumberInput value={state.customMargin} onChange={(v) => setState({ customMargin: v })} />
            </Field>
          ) : null}
          <Field label={T("Округление вверх", "Round up to", "Làm tròn lên")}>
            <select value={state.roundTo} onChange={(e) => setState({ roundTo: Number(e.target.value) })}>
              <option value={1000}>1 000 ₫</option>
              <option value={5000}>5 000 ₫</option>
              <option value={10000}>10 000 ₫</option>
            </select>
          </Field>
        </div>
        {rec.unreachable || rec.warning === "unreachable_target_margin" ? (
          <div className="erpNotice warn">
            {T(
              "Целевая маржинальность недостижима при текущих ставках комиссии/рекламы/НДС.",
              "Target margin is unreachable with current commission/advertising/VAT rates.",
              "Không đạt được biên mục tiêu với tỷ lệ hoa hồng/quảng cáo/VAT hiện tại.",
            )}
          </div>
        ) : (
          <dl className="erpFinanceDl">
            <div><dt>{T("Текущая цена", "Current price", "Giá hiện tại")}</dt><dd>{money(current)}</dd></div>
            <div><dt>{T("Рекомендуемая цена", "Recommended price", "Giá đề xuất")}</dt><dd>{money(rec.price)}</dd></div>
            <div><dt>{T("Разница", "Difference", "Chênh lệch")}</dt><dd>{money(diff)}{diffPct != null ? <span className="erpCellSub">{pct(diffPct)}</span> : null}</dd></div>
            <div><dt>{T("Ожидаемая маржинальность", "Expected margin %", "Biên kỳ vọng")}</dt><dd>{pct(rec.actualMarginPct)}</dd></div>
          </dl>
        )}
        {rec.price != null && !rec.unreachable ? (
          <div className="erpActions">
            {state.pendingPrice === rec.price ? (
              <>
                <button type="button" className="erpBtn primary" onClick={() => { onApplyPrice(rec.price!); setState({ pendingPrice: null }); }}>
                  {T("Подтвердить применение цены", "Confirm apply price", "Xác nhận áp dụng giá")}
                </button>
                <button type="button" className="erpBtn ghost" onClick={() => setState({ pendingPrice: null })}>
                  {T("Отмена", "Cancel", "Hủy")}
                </button>
              </>
            ) : (
              <button type="button" className="erpBtn" onClick={() => setState({ pendingPrice: rec.price })}>
                {T("Применить рекомендованную цену…", "Apply recommended price…", "Áp dụng giá đề xuất…")}
              </button>
            )}
            <p className="erpHint">
              {T(
                "Цена канала в форме изменится только после подтверждения. Автоматически не сохраняется и не меняет цену меню без вашего действия.",
                "Channel price in the form changes only after confirmation. Nothing is auto-saved or applied to the menu price.",
                "Giá kênh chỉ đổi sau xác nhận. Không tự lưu hay đổi giá menu.",
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DishChannelFinancePanel({
  channels,
  settings,
  vatExceptions,
  dishId,
  categoryId,
  dishVatRate,
  menuPrice,
  channelPrices,
  costs,
  onChannelPrice,
  defaultDetailed = true,
}: Props) {
  const active = channels.filter((c) => !c.archived_at).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const [detailed, setDetailed] = useState(defaultDetailed);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const rowState = (id: string, channel: ErpChannel): RowState =>
    rows[id] ?? {
      open: false,
      adsScenario: null,
      vatSim: "current",
      partialPct: channel.commission_deductible_vat_pct ?? 50,
      marginKind: "target",
      customMargin: channel.target_margin_pct ?? 45,
      roundTo: 1000,
      pendingPrice: null,
    };

  const patchRow = (id: string, channel: ErpChannel, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...rowState(id, channel), ...patch } }));

  const views = useMemo(() => {
    return active.map((channel) => {
      const st = rowState(channel.id, channel);
      const price = channelPrices[channel.id] ?? menuPrice;
      const outputVatRate = resolveDishOutputVatRate({
        settings,
        exceptions: vatExceptions,
        channel,
        dishId,
        categoryId,
        dishVatRate,
      });
      const overrides: DishChannelOverrides = {
        advertisingScenario: st.adsScenario,
        vatSimulation: st.vatSim,
        partialDeductibleVatPct: st.partialPct,
      };
      return {
        channel,
        st,
        view: computeDishChannelFinance({
          channel,
          grossSellingPrice: price,
          foodCost: costs.foodCost,
          packagingCost: costs.packagingCost,
          outputVatRate,
          overrides,
        }),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowState from rows map
  }, [active, channelPrices, menuPrice, costs, settings, vatExceptions, dishId, categoryId, dishVatRate, rows]);

  if (!active.length) return null;

  return (
    <section className="erpCard" data-testid="dish-channel-finance">
      <h2>
        {T("Каналы продаж", "Sales channels", "Kênh bán")}{" "}
        <Tip>
          {T(
            "Маржа вклада (CM) = Выручка без НДС − Себестоимость − Эффективные расходы канала (комиссия, реклама). Это не чистая прибыль. Расчёт только через financialCalculator.",
            "Contribution Margin = Net Revenue − Product Cost − Effective Channel Expenses. Not Net Profit. Formulas only from financialCalculator.",
            "Contribution Margin = Net Revenue − Product Cost − Effective Channel Expenses. Không phải Net Profit.",
          )}
        </Tip>
      </h2>
      <div className="erpToolbar">
        <label className="erpCheck">
          <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
          {T("Подробный вид", "Detailed View", "Xem chi tiết")}
        </label>
        <span className="erpMuted">{detailed ? null : T("Краткий вид", "Compact View", "Xem gọn")}</span>
      </div>
      <div className="erpTableWrap">
        <table className="erpTable stack">
          <thead>
            <tr>
              <th />
              <th>{T("Канал", "Sales Channel", "Kênh")}</th>
              <th>{T("Цена, ₫", "Selling Price, ₫", "Giá, ₫")}</th>
              <th className="num">{T("Исх. НДС", "Output VAT", "VAT đầu ra")}</th>
              <th className="num">{T("Комиссия", "Commission", "Hoa hồng")}</th>
              <th className="num">{T("Реклама", "Advertising", "Quảng cáo")}</th>
              <th className="num">Food Cost %</th>
              <th className="num">{T("Себестоимость %", "Total Product Cost %", "Giá vốn %")}</th>
              <th className="num">{T("Маржа вклада", "Contribution Margin", "Contribution Margin")}</th>
              <th className="num">CM %</th>
            </tr>
          </thead>
          <tbody>
            {views.map(({ channel, st, view }) => {
              const r = view.result;
              const showMargin = view.mode !== "incomplete" && r?.complete;
              return (
                <Fragment key={channel.id}>
                  <tr data-testid={`channel-row-${channel.code}`}>
                    <td>
                      <button
                        type="button"
                        className="erpLink"
                        aria-expanded={st.open}
                        onClick={() => patchRow(channel.id, channel, { open: !st.open })}
                      >
                        {st.open ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="main">
                      <span className="erpName">{channel.name}</span>
                      {view.preliminary ? <span className="erpBadge warn">{T("Предварительно", "Preliminary", "Sơ bộ")}</span> : null}
                      {view.mode === "legacy" ? <span className="erpBadge warn">{T("Устаревшая модель", "Legacy", "Legacy")}</span> : null}
                      {view.mode === "incomplete" ? <span className="erpBadge bad">{T("Неполно", "Incomplete", "Chưa đủ")}</span> : null}
                      {view.simulation ? <span className="erpBadge warn">{T("Симуляция", "Simulation", "Mô phỏng")}</span> : null}
                    </td>
                    <td className="edit" data-label={T("Цена, ₫", "Price, ₫", "Giá, ₫")} style={{ minWidth: 120 }}>
                      <NumberInput
                        value={channelPrices[channel.id] ?? null}
                        placeholder={menuPrice === null ? "" : `${menuPrice} (${T("как в меню", "menu price", "như menu")})`}
                        onChange={(v) => onChannelPrice(channel.id, v)}
                      />
                    </td>
                    <td className="num" data-label={T("Исх. НДС", "Output VAT", "VAT đầu ra")}>
                      {settings.output_vat_enabled ? (
                        <>
                          {money(r?.outputVatAmount ?? null)}
                          <span className="erpCellSub">{rate(view.outputVatRate)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num" data-label={T("Комиссия", "Commission", "Hoa hồng")}>
                      {view.mode === "incomplete" ? "—" : money(r?.effectiveCommissionExpense)}
                      {r?.commissionNetRate != null ? <span className="erpCellSub">{rate(r.commissionNetRate)}</span> : null}
                    </td>
                    <td className="num" data-label={T("Реклама", "Advertising", "Quảng cáo")}>
                      {view.mode === "incomplete" ? "—" : money(r?.effectiveAdvertisingExpense)}
                      {r?.advertisingGrossRate != null ? <span className="erpCellSub">{rate(r.advertisingGrossRate)}</span> : null}
                    </td>
                    <td className="num" data-label="Food Cost %">
                      {showMargin ? pct(r?.foodCostPct) : "—"}
                    </td>
                    <td className="num" data-label={T("Себестоимость %", "Cost %", "Giá vốn %")}>
                      {showMargin ? pct(r?.totalProductCostPct) : "—"}
                    </td>
                    <td className={`num ${bandClass(showMargin ? view.band : null)}`} data-label={T("Маржа вклада", "Contribution Margin", "Contribution Margin")}>
                      {showMargin ? money(r?.contributionMargin) : view.mode === "incomplete" ? T("Неполно", "Incomplete", "Chưa đủ") : "—"}
                    </td>
                    <td className={`num ${bandClass(showMargin ? view.band : null)}`} data-label="CM %">
                      {showMargin ? pct(r?.contributionMarginPct) : "—"}
                    </td>
                  </tr>
                  {st.open || detailed ? (
                    <tr className="erpChannelFinanceExpand">
                      <td colSpan={10}>
                        <RowDetail
                          view={view}
                          state={st}
                          setState={(patch) => patchRow(channel.id, channel, patch)}
                          onApplyPrice={(price) => onChannelPrice(channel.id, price)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="erpHint">
        {T(
          "Пустая цена канала = цена в меню. Проценты Food/Product Cost — от Net Revenue. Contribution Margin ≠ Net Profit.",
          "Empty channel price = menu price. Food/Product Cost % are of Net Revenue. Contribution Margin ≠ Net Profit.",
          "Giá kênh trống = giá menu. % giá vốn tính trên Net Revenue. Contribution Margin ≠ Net Profit.",
        )}
      </p>
    </section>
  );
}

/** Summary KPIs for dish header / list — Direct (or first) channel via calculator. */
export function dishMainChannelFinance(
  channels: ErpChannel[],
  opts: {
    settings: ErpSettings;
    vatExceptions?: ErpVatException[] | null;
    dish?: Pick<ErpDish, "id" | "vat_rate" | "category_id" | "sale_price" | "channel_prices"> | null;
    foodCost: number | null;
    packagingCost: number | null;
  },
) {
  const channel = channels.find((c) => !c.archived_at && c.code === "direct") ?? channels.find((c) => !c.archived_at) ?? null;
  if (!channel) return null;
  const price =
    opts.dish?.channel_prices?.find((p) => p.channel_id === channel.id)?.sale_price ?? opts.dish?.sale_price ?? null;
  const outputVatRate = resolveDishOutputVatRate({
    settings: opts.settings,
    exceptions: opts.vatExceptions,
    channel,
    dishId: opts.dish?.id,
    categoryId: opts.dish?.category_id,
    dishVatRate: opts.dish?.vat_rate,
  });
  return computeDishChannelFinance({
    channel,
    grossSellingPrice: price,
    foodCost: opts.foodCost,
    packagingCost: opts.packagingCost,
    outputVatRate,
  });
}
