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
    ? T("Critical", "Critical", "Critical")
    : band === "acceptable"
      ? T("Acceptable", "Acceptable", "Acceptable")
      : band === "good"
        ? T("Good", "Good", "Good")
        : band === "excellent"
          ? T("Excellent", "Excellent", "Excellent")
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
        <strong>{T("Financial Settings Incomplete", "Financial Settings Incomplete", "Financial Settings Incomplete")}</strong>
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
            <option value="current">{T("Current VAT Status", "Current VAT Status", "Current VAT Status")}</option>
            <option value="full">{T("Full VAT Deduction (Simulation)", "Full VAT Deduction (Simulation)", "Full VAT Deduction (Simulation)")}</option>
            <option value="partial">{T("Partial VAT Deduction (Simulation)", "Partial VAT Deduction (Simulation)", "Partial VAT Deduction (Simulation)")}</option>
            <option value="none">{T("No VAT Deduction (Simulation)", "No VAT Deduction (Simulation)", "No VAT Deduction (Simulation)")}</option>
          </select>
        </Field>
        {state.vatSim === "partial" ? (
          <Field label={T("Вычет, %", "Deductible, %", "Khấu trừ, %")}>
            <NumberInput value={state.partialPct} onChange={(v) => setState({ partialPct: v })} />
          </Field>
        ) : null}
        {view.simulation ? <span className="erpBadge warn">Simulation</span> : null}
      </div>

      <div className="erpGrid two erpFinanceBlocks">
        <div>
          <h4>{T("Revenue", "Revenue", "Doanh thu")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>Gross Selling Price</dt><dd>{money(r.grossSellingPrice)}</dd></div>
            <div><dt>Merchant Discount</dt><dd>{money(r.merchantFundedDiscount)}</dd></div>
            <div><dt>Output VAT Rate</dt><dd>{rate(r.outputVatRate)}</dd></div>
            <div><dt>Output VAT Amount</dt><dd>{money(r.outputVatAmount)}</dd></div>
            <div><dt>Net Revenue</dt><dd>{money(r.netRevenue)}</dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Product Cost", "Product Cost", "Giá vốn")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>Food Cost</dt><dd>{money(r.foodCost)} <span className="erpCellSub">{pct(r.foodCostPct)}</span></dd></div>
            <div><dt>Packaging Cost</dt><dd>{money(r.packagingCost)} <span className="erpCellSub">{pct(r.packagingCostPct)}</span></dd></div>
            <div><dt>Total Product Cost</dt><dd>{money(r.totalProductCost)} <span className="erpCellSub">{pct(r.totalProductCostPct)}</span></dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Platform Commission", "Platform Commission", "Hoa hồng sàn")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>Commission Net Rate</dt><dd>{rate(r.commissionNetRate)}</dd></div>
            <div><dt>Commission VAT Rate</dt><dd>{rate(channel.commission_vat_rate)}</dd></div>
            <div><dt>Commission Gross Rate</dt><dd>{rate(r.commissionGrossRate)}</dd></div>
            <div><dt>Commission Net Amount</dt><dd>{money(r.commissionNetAmount)}</dd></div>
            <div><dt>Commission VAT Amount</dt><dd>{money(r.commissionVatAmount)}</dd></div>
            <div><dt>Commission Gross Amount</dt><dd>{money(r.commissionGrossAmount)}</dd></div>
            <div><dt>Deductible VAT</dt><dd>{money(r.deductibleCommissionVat)}</dd></div>
            <div><dt>Effective Commission Expense</dt><dd>{money(r.effectiveCommissionExpense)}</dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Advertising", "Advertising", "Quảng cáo")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>Advertising Scenario</dt><dd>{r.advertisingScenario ?? "—"}</dd></div>
            <div><dt>Advertising Gross Rate</dt><dd>{rate(r.advertisingGrossRate)}</dd></div>
            <div><dt>Advertising VAT Rate</dt><dd>{rate(channel.advertising_vat_rate)}</dd></div>
            <div><dt>Advertising Net Amount</dt><dd>{money(r.advertisingNetAmount)}</dd></div>
            <div><dt>Advertising VAT Amount</dt><dd>{money(r.advertisingVatAmount)}</dd></div>
            <div><dt>Advertising Gross Amount</dt><dd>{money(r.advertisingGrossAmount)}</dd></div>
            <div><dt>Deductible VAT</dt><dd>{money(r.deductibleAdvertisingVat)}</dd></div>
            <div><dt>Effective Advertising Expense</dt><dd>{money(r.effectiveAdvertisingExpense)}</dd></div>
          </dl>
        </div>
        <div>
          <h4>{T("Financial Results", "Financial Results", "Kết quả tài chính")}</h4>
          <dl className="erpFinanceDl">
            <div><dt>Total Channel Expenses</dt><dd>{money(r.totalChannelExpenses)}</dd></div>
            <div><dt>Total Variable Expenses</dt><dd>{money(r.totalVariableExpenses)}</dd></div>
            <div>
              <dt>
                Estimated Platform Payout{" "}
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
              <dt>Contribution Margin</dt>
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
        <h4>{T("Recommended Selling Price", "Recommended Selling Price", "Giá bán đề xuất")}</h4>
        <div className="erpToolbar erpChannelFinanceControls">
          <Field label={T("Цель маржи", "Margin target", "Mục tiêu biên")}>
            <select value={state.marginKind} onChange={(e) => setState({ marginKind: e.target.value as MarginTargetKind })}>
              <option value="minimum">Minimum Margin ({rate(channel.min_margin_pct)})</option>
              <option value="target">Target Margin ({rate(channel.target_margin_pct)})</option>
              <option value="optimal">Optimal Margin ({rate(channel.optimal_margin_pct)})</option>
              <option value="custom">Custom Margin</option>
            </select>
          </Field>
          {state.marginKind === "custom" ? (
            <Field label={T("Custom, %", "Custom, %", "Custom, %")}>
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
            "Contribution Margin = Net Revenue − Product Cost − Effective Channel Expenses. Не Net Profit. Формулы только из financialCalculator.",
            "Contribution Margin = Net Revenue − Product Cost − Effective Channel Expenses. Not Net Profit. Formulas only from financialCalculator.",
            "Contribution Margin = Net Revenue − Product Cost − Effective Channel Expenses. Không phải Net Profit.",
          )}
        </Tip>
      </h2>
      <div className="erpToolbar">
        <label className="erpCheck">
          <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
          {T("Detailed View", "Detailed View", "Detailed View")}
        </label>
        <span className="erpMuted">{detailed ? null : T("Compact View", "Compact View", "Compact View")}</span>
      </div>
      <div className="erpTableWrap">
        <table className="erpTable stack">
          <thead>
            <tr>
              <th />
              <th>{T("Канал", "Sales Channel", "Kênh")}</th>
              <th>{T("Цена, ₫", "Selling Price, ₫", "Giá, ₫")}</th>
              <th className="num">Output VAT</th>
              <th className="num">{T("Комиссия", "Commission", "Hoa hồng")}</th>
              <th className="num">{T("Реклама", "Advertising", "Quảng cáo")}</th>
              <th className="num">Food Cost %</th>
              <th className="num">{T("Себестоимость %", "Total Product Cost %", "Giá vốn %")}</th>
              <th className="num">Contribution Margin</th>
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
                      {view.preliminary ? <span className="erpBadge warn">Preliminary</span> : null}
                      {view.mode === "legacy" ? <span className="erpBadge warn">Legacy</span> : null}
                      {view.mode === "incomplete" ? <span className="erpBadge bad">Incomplete</span> : null}
                      {view.simulation ? <span className="erpBadge warn">Simulation</span> : null}
                    </td>
                    <td className="edit" data-label={T("Цена, ₫", "Price, ₫", "Giá, ₫")} style={{ minWidth: 120 }}>
                      <NumberInput
                        value={channelPrices[channel.id] ?? null}
                        placeholder={menuPrice === null ? "" : `${menuPrice} (${T("как в меню", "menu price", "như menu")})`}
                        onChange={(v) => onChannelPrice(channel.id, v)}
                      />
                    </td>
                    <td className="num" data-label="Output VAT">
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
                    <td className={`num ${bandClass(showMargin ? view.band : null)}`} data-label="Contribution Margin">
                      {showMargin ? money(r?.contributionMargin) : view.mode === "incomplete" ? T("Incomplete", "Incomplete", "Incomplete") : "—"}
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
