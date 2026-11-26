"use client";

import { useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { errorText, Field, NavLink, PageHead, savingText, T, vnd } from "./ui";

function SubNav({
  active,
}: {
  active: "overview" | "channels" | "locations" | "products" | "cogs";
}) {
  const items = [
    { id: "overview", href: FINANCE_HREFS.profitability, label: T("Обзор", "Overview", "Tổng quan") },
    { id: "channels", href: `${FINANCE_HREFS.profitability}/channels`, label: T("Каналы", "Channels", "Kênh") },
    { id: "locations", href: `${FINANCE_HREFS.profitability}/locations`, label: T("Подразделения", "Locations", "Chi nhánh") },
    { id: "products", href: `${FINANCE_HREFS.profitability}/products`, label: T("Блюда", "Products", "Món") },
    { id: "cogs", href: `${FINANCE_HREFS.profitability}/cogs`, label: T("Pending COGS", "Pending COGS", "COGS chờ") },
  ] as const;
  return (
    <nav className="erpSubTabs" aria-label="Profitability">
      {items.map((t) => (
        <NavLink key={t.id} href={t.href} className={t.id === active ? "active" : ""}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function PeriodBar({
  month,
  setMonth,
  onLoad,
  busy,
}: {
  month: string;
  setMonth: (v: string) => void;
  onLoad: () => void;
  busy: boolean;
}) {
  return (
    <div className="erpFinancePeriod" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>
        {T("Период", "Period", "Kỳ")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
      <button type="button" className="erpBtn primary" disabled={busy} onClick={onLoad}>
        {busy ? savingText() : T("Рассчитать", "Calculate", "Tính")}
      </button>
    </div>
  );
}

export function FinanceProfitabilityOverviewPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await run({
        action: "profitabilityChannels",
        value: { from, to },
      })) as Record<string, unknown>;
      setData(res);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const channels = (data?.channels as Array<Record<string, unknown>>) || [];
  const comp = (data?.completeness as Record<string, unknown>) || {};
  const totals = channels.reduce(
    (a, c) => ({
      net: a.net + Number(c.net_revenue || 0),
      cogs: a.cogs + Number(c.total_actual_cogs || 0),
      gp: a.gp + Number(c.gross_profit || 0),
    }),
    { net: 0, cogs: 0, gp: 0 },
  );

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Прибыльность", "Profitability", "Lợi nhuận")}
        sub={T(
          "Фактическая маржа каналов/подразделений/блюд. Estimated ≠ Actual. Pending COGS не = 0.",
          "Actual channel/location/product margin. Estimated ≠ Actual. Pending COGS ≠ 0.",
          "Biên lợi nhuận thực tế.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.profitability} />
      <SubNav active="overview" />
      <PeriodBar month={month} setMonth={setMonth} onLoad={() => void load()} busy={busy} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      {data ? (
        <>
          <p className="erpHint">
            {T("Полнота", "Completeness", "Đầy đủ")}: {String(comp.status)}
            {comp.is_fully_actual ? "" : ` · ${T("не полный Actual", "not fully Actual", "chưa đủ Actual")}`}
          </p>
          <div className="erpFinanceTotals" data-testid="profitability-overview">
            <div>
              <span>Net Revenue</span>
              <strong>{vnd(totals.net || null)}</strong>
            </div>
            <div>
              <span>Total Actual COGS</span>
              <strong>{vnd(totals.cogs || null)}</strong>
            </div>
            <div>
              <span>Gross Profit</span>
              <strong>{vnd(totals.gp || null)}</strong>
            </div>
            <div>
              <span>Pending COGS orders</span>
              <strong>{String(comp.cogs_pending_count ?? "—")}</strong>
            </div>
          </div>
          <p className="erpHint">
            <NavLink href={FINANCE_HREFS.sales}>{T("Продажи", "Sales", "Bán")}</NavLink>
            {" · "}
            <NavLink href={`${FINANCE_HREFS.profitability}/cogs`}>Pending COGS</NavLink>
            {" · "}
            <NavLink href={FINANCE_HREFS.platforms}>{T("Агрегаторы", "Platforms", "Sàn")}</NavLink>
          </p>
        </>
      ) : (
        <p className="erpHint">{T("Выберите период и рассчитайте", "Pick period and calculate", "Chọn kỳ và tính")}</p>
      )}
    </div>
  );
}

export function FinanceProfitabilityChannelsPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [comp, setComp] = useState<Record<string, unknown> | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await run({ action: "profitabilityChannels", value: { from, to } })) as {
        channels?: Array<Record<string, unknown>>;
        completeness?: Record<string, unknown>;
      };
      setRows(res.channels || []);
      setComp(res.completeness || null);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Прибыльность каналов", "Channel profitability", "Lợi nhuận kênh")} />
      <FinanceMobileNav active={FINANCE_HREFS.profitability} />
      <SubNav active="channels" />
      <PeriodBar month={month} setMonth={setMonth} onLoad={() => void load()} busy={busy} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      {comp ? (
        <p className="erpHint">
          {String(comp.status)} · Sales {String(comp.sales_count)} · Pending COGS {String(comp.cogs_pending_count)}
        </p>
      ) : null}
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="profitability-channels">
          <thead>
            <tr>
              <th>{T("Канал", "Channel", "Kênh")}</th>
              <th className="num">Net Revenue</th>
              <th className="num">Actual COGS</th>
              <th className="num">Gross Profit</th>
              <th className="num">GM %</th>
              <th className="num">Pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>—</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={String(r.sales_channel_id ?? i)}>
                  <td>{String(r.channel_name ?? r.channel_code)}</td>
                  <td className="num">{vnd(Number(r.net_revenue) || null)}</td>
                  <td className="num">{vnd(Number(r.total_actual_cogs) || null)}</td>
                  <td className="num">{vnd(Number(r.gross_profit) || null)}</td>
                  <td className="num">{r.gross_margin_pct != null ? `${Number(r.gross_margin_pct)}%` : "—"}</td>
                  <td className="num">{String(r.pending_cogs_orders ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="erpHint">
        {T(
          "Комиссия/реклама Grab — actual settlements. Net Earnings ≠ чистая прибыль. Реклама кампаний не распределяется на блюда автоматически.",
          "Grab commission/ads from actual settlements. Net Earnings ≠ net profit. Campaign ads not auto-allocated to dishes.",
          "Hoa hồng/quảng cáo thực tế.",
        )}
      </p>
    </div>
  );
}

export function FinanceProfitabilityLocationsPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await run({ action: "profitabilityLocations", value: { from, to } })) as {
        locations?: Array<Record<string, unknown>>;
      };
      setRows(res.locations || []);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Прибыльность подразделений", "Location profitability", "Lợi nhuận chi nhánh")} />
      <FinanceMobileNav active={FINANCE_HREFS.profitability} />
      <SubNav active="locations" />
      <PeriodBar month={month} setMonth={setMonth} onLoad={() => void load()} busy={busy} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable">
          <thead>
            <tr>
              <th>{T("Подразделение", "Location", "Chi nhánh")}</th>
              <th className="num">Orders</th>
              <th className="num">Net Revenue</th>
              <th className="num">Actual COGS</th>
              <th className="num">Gross Profit</th>
              <th className="num">Pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>—</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={String(r.location_id ?? i)}>
                  <td>{String(r.location_name ?? r.location_code ?? "—")}</td>
                  <td className="num">{String(r.order_count ?? 0)}</td>
                  <td className="num">{vnd(Number(r.net_revenue) || null)}</td>
                  <td className="num">{vnd(Number(r.total_actual_cogs) || null)}</td>
                  <td className="num">{vnd(Number(r.gross_profit) || null)}</td>
                  <td className="num">{String(r.pending_cogs_orders ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="erpHint">
        {T(
          "Prep Kitchen — cost center без внешней выручки. Внутренние перемещения ≠ повторная выручка.",
          "Prep Kitchen is a cost center without external sales. Internal transfers ≠ revenue.",
          "Prep Kitchen là cost center.",
        )}
      </p>
    </div>
  );
}

export function FinanceProfitabilityProductsPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await run({ action: "profitabilityProducts", value: { from, to } })) as {
        products?: Array<Record<string, unknown>>;
      };
      setRows(res.products || []);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Прибыльность блюд", "Product profitability", "Lợi nhuận món")} />
      <FinanceMobileNav active={FINANCE_HREFS.profitability} />
      <SubNav active="products" />
      <PeriodBar month={month} setMonth={setMonth} onLoad={() => void load()} busy={busy} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="profitability-products">
          <thead>
            <tr>
              <th>{T("Блюдо", "Item", "Món")}</th>
              <th className="num">Qty</th>
              <th className="num">Net Revenue</th>
              <th className="num">Food COGS</th>
              <th className="num">Pack COGS</th>
              <th className="num">Actual</th>
              <th className="num">Estimated</th>
              <th className="num">Variance</th>
              <th className="num">GM %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>—</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={String(r.item_id ?? i)}>
                  <td>
                    {String(r.item_name)}
                    {r.has_pending_cogs ? " ⚠" : ""}
                  </td>
                  <td className="num">{String(r.quantity_sold ?? 0)}</td>
                  <td className="num">{vnd(Number(r.net_revenue) || null)}</td>
                  <td className="num">{vnd(Number(r.food_actual_cogs) || null)}</td>
                  <td className="num">{vnd(Number(r.packaging_actual_cogs) || null)}</td>
                  <td className="num">{vnd(Number(r.total_actual_cogs) || null)}</td>
                  <td className="num">{vnd(Number(r.estimated_cogs) || null)}</td>
                  <td className="num">{vnd(Number(r.cogs_variance) || null)}</td>
                  <td className="num">{r.gross_margin_pct != null ? `${Number(r.gross_margin_pct)}%` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="erpHint">
        {T(
          "Contribution Margin по блюду скрыт, если общие расходы канала не распределены.",
          "Dish Contribution Margin hidden when channel expenses are not allocated.",
          "CM món ẩn nếu chi phí kênh chưa phân bổ.",
        )}
      </p>
    </div>
  );
}

export function FinanceProfitabilityCogsPage() {
  const { state, run } = useErp();
  const pending = (state?.salesPendingCogs ?? []) as Array<Record<string, unknown>>;
  const [month, setMonth] = useState(currentYearMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [remote, setRemote] = useState<Array<Record<string, unknown>> | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await run({ action: "profitabilityPendingCogs", value: { from, to } })) as Array<
        Record<string, unknown>
      >;
      setRemote(Array.isArray(res) ? res : []);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = remote ?? pending;

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Pending COGS", "Pending COGS", "COGS chờ")} />
      <FinanceMobileNav active={FINANCE_HREFS.profitability} />
      <SubNav active="cogs" />
      <PeriodBar month={month} setMonth={setMonth} onLoad={() => void load()} busy={busy} />
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <p className="erpHint">
        {T(
          "Недостающий остаток ≠ нулевая себестоимость. Партии позже не распределяются на историю автоматически.",
          "Missing stock ≠ zero COGS. Later lots are not auto-allocated to history.",
          "Thiếu tồn ≠ COGS = 0.",
        )}
      </p>
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="pending-cogs-table">
          <thead>
            <tr>
              <th>{T("Продажа", "Sale", "Đơn")}</th>
              <th>{T("Продукт", "Product", "SP")}</th>
              <th className="num">{T("Недостаёт", "Missing qty", "Thiếu")}</th>
              <th>{T("Причина", "Reason", "Lý do")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    <NavLink href={`${FINANCE_HREFS.sales}/${String(r.sales_document_id)}`}>
                      {String(r.sales_document_id).slice(0, 8)}
                    </NavLink>
                  </td>
                  <td>{String(r.product_id ?? "—").slice(0, 8)}</td>
                  <td className="num">{String(r.missing_qty)}</td>
                  <td>{String(r.reason)}</td>
                  <td>{String(r.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <Field label=" ">
        <span className="erpHint">{T("Auto-consume production = OFF", "Auto-consume production = OFF", "Auto-consume OFF")}</span>
      </Field>
    </div>
  );
}
