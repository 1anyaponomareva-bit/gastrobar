"use client";

import { useEffect, useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { detectAndParse, october2026FixtureRows, sha256Hex } from "@/lib/erp/platformImport";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { errorText, Field, NavLink, PageHead, savingText, T, vnd } from "./ui";

type Dash = {
  gross_sales?: number;
  net_sales?: number;
  actual_commission?: number;
  actual_advertising?: number;
  refunds?: number;
  chargebacks?: number;
  other_adjustments?: number;
  net_earnings?: number;
  actual_payouts?: number;
  outstanding_balance?: number;
  reconciliation_difference?: number;
};

export function FinancePlatformsOverviewPage() {
  const { run } = useErp();
  const [month, setMonth] = useState(currentYearMonth);
  const { from, to } = monthRange(month);
  const [dash, setDash] = useState<Dash>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = (await run({
          action: "platformDashboard",
          value: { from, to },
        })) as Dash;
        setDash(res || {});
        setErr(null);
      } catch (e) {
        setErr(errorText(e));
      }
    })();
  }, [from, to, run]);

  const cards: Array<[string, number | undefined]> = [
    [T("Gross Sales", "Gross Sales", "Gross Sales"), dash.gross_sales],
    [T("Net Sales", "Net Sales", "Net Sales"), dash.net_sales],
    [T("Факт. комиссия", "Actual Commission", "Hoa hồng thực"), dash.actual_commission],
    [T("Факт. реклама", "Actual Advertising", "QC thực"), dash.actual_advertising],
    [T("Возвраты", "Refunds", "Hoàn"), dash.refunds],
    [T("Chargebacks", "Chargebacks", "Chargebacks"), dash.chargebacks],
    [T("Прочие корректировки", "Other Adjustments", "Điều chỉnh"), dash.other_adjustments],
    [T("Net Earnings", "Net Earnings", "Net Earnings"), dash.net_earnings],
    [T("Факт. выплаты", "Actual Payouts", "Chi trả"), dash.actual_payouts],
    [T("Задолженность", "Outstanding", "Còn lại"), dash.outstanding_balance],
    [T("Разница сверки", "Reconciliation diff", "Chênh lệch"), dash.reconciliation_difference],
  ];

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Агрегаторы", "Platforms", "Sàn")}
        sub={T(
          "Фактические комиссии / реклама / выплаты. Forecast канала R1 не подставляется.",
          "Actual commission / ads / payouts. R1 channel forecast is not injected.",
          "Số thực. Không dùng % dự báo R1.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.platforms} />
      <PlatformSubNav active="overview" />
      <div className="erpFinancePeriod">
        <label>
          {T("Период", "Period", "Kỳ")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      <div className="erpFinanceTotals" data-testid="platform-dashboard">
        {cards.map(([label, val]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{vnd(val ?? null)}</strong>
          </div>
        ))}
      </div>
      <p className="erpHint">
        {T(
          "Net Earnings ≠ чистая прибыль и ≠ банковское поступление без сверки.",
          "Net Earnings ≠ company net profit and ≠ bank receipt without reconciliation.",
          "Net Earnings ≠ lợi nhuận / không phải tiền ngân hàng nếu chưa đối soát.",
        )}
      </p>
    </div>
  );
}

function PlatformSubNav({
  active,
}: {
  active: "overview" | "import" | "commission" | "ads" | "payouts" | "reconcile";
}) {
  const items = [
    { id: "overview", href: FINANCE_HREFS.platforms, label: T("Обзор", "Overview", "Tổng quan") },
    { id: "import", href: `${FINANCE_HREFS.platforms}/import`, label: T("Импорт", "Import", "Nhập") },
    { id: "commission", href: `${FINANCE_HREFS.platforms}/commission`, label: T("Комиссии", "Commission", "Hoa hồng") },
    { id: "ads", href: `${FINANCE_HREFS.platforms}/ads`, label: T("Реклама", "Advertising", "QC") },
    { id: "payouts", href: `${FINANCE_HREFS.platforms}/payouts`, label: T("Выплаты", "Payouts", "Chi trả") },
    { id: "reconcile", href: `${FINANCE_HREFS.platforms}/reconcile`, label: T("Сверка", "Reconcile", "Đối soát") },
  ] as const;
  return (
    <nav className="erpSubTabs" aria-label="Platforms">
      {items.map((t) => (
        <NavLink key={t.id} href={t.href} className={t.id === active ? "active" : ""}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function FinancePlatformImportPage() {
  const { state, run } = useErp();
  const accounts = state?.platformAccounts ?? [];
  const batches = state?.platformImportBatches ?? [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");

  const runFixture = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const rows = october2026FixtureRows();
      const body = JSON.stringify({ rows });
      const sha = await sha256Hex(body + ":oct2026:" + Date.now());
      const up = (await run({
        action: "platformImportUpload",
        value: {
          platform_code: "grab",
          platform_account_id: accountId || accounts[0]?.id || null,
          source_format: "normalized_json_v1",
          file_name: "grab-oct2026-normalized.json",
          file_sha256: sha,
          notes: "TEST fixture only — not real Oct 2026 documents",
        },
      })) as { id?: string };
      const batchId = up.id;
      if (!batchId) throw new Error("no batch id");
      await run({ action: "platformImportPreview", id: batchId, value: { rows } });
      await run({ action: "platformImportConfirm", id: batchId });
      const applied = await run({
        action: "platformImportApply",
        id: batchId,
        value: { create_vat_expenses: true, settlement_key: `grab:fixture:oct2026:${batchId}` },
      });
      setMsg(T("Fixture применён (тест)", "Fixture applied (test)", "Fixture OK") + ": " + JSON.stringify(applied).slice(0, 180));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const text = await file.text();
      const parsed = detectAndParse(text, file.name);
      if (!parsed.ok) {
        setErr((parsed.errors[0]?.error || "parse_failed") + (parsed.note ? ` — ${parsed.note}` : ""));
        return;
      }
      const sha = await sha256Hex(text);
      const fmt =
        parsed.format === "normalized_csv_v1"
          ? "normalized_csv_v1"
          : parsed.format === "normalized_json_v1"
            ? "normalized_json_v1"
            : "other";
      const up = (await run({
        action: "platformImportUpload",
        value: {
          platform_code: "grab",
          platform_account_id: accountId || accounts[0]?.id || null,
          source_format: fmt,
          file_name: file.name,
          file_sha256: sha,
        },
      })) as { id?: string };
      if (!up.id) throw new Error("no batch");
      const prev = await run({ action: "platformImportPreview", id: up.id, value: { rows: parsed.rows } });
      setMsg(T("Preview готов — подтвердите отдельно", "Preview ready — confirm separately", "Preview xong") + ": " + JSON.stringify(prev).slice(0, 200));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Импорт отчётов", "Report import", "Nhập báo cáo")} />
      <FinanceMobileNav active={FINANCE_HREFS.platforms} />
      <PlatformSubNav active="import" />
      <p className="erpNotice warn">
        {T(
          "Сырой GrabMerchant CSV/XLSX не парсится без вашего образца файла. Используйте normalized JSON/CSV или тестовый fixture.",
          "Raw GrabMerchant CSV/XLSX will not parse without your sample file. Use normalized JSON/CSV or the test fixture.",
          "CSV/XLSX Grab thô cần file mẫu từ bạn.",
        )}
      </p>
      <Field label={T("Аккаунт платформы", "Platform account", "Tài khoản sàn")}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{T("По умолчанию", "Default", "Mặc định")}</option>
          {accounts.map((a) => (
            <option key={String(a.id)} value={String(a.id)}>
              {String(a.display_name)}
            </option>
          ))}
        </select>
      </Field>
      <div className="erpActions" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <label className="erpBtn">
          {T("Загрузить файл", "Upload file", "Tải file")}
          <input
            type="file"
            accept=".json,.csv,.xlsx,.xls,text/csv,application/json"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
        <button type="button" className="erpBtn primary" disabled={busy} onClick={() => void runFixture()}>
          {busy ? savingText() : T("Тест: Oct 2026 fixture", "Test: Oct 2026 fixture", "Test Oct 2026")}
        </button>
      </div>
      {err ? <p className="erpNotice warn">{err}</p> : null}
      {msg ? <p className="erpHint">{msg}</p> : null}
      <section className="erpMenuPanel" style={{ marginTop: 16 }}>
        <h2>{T("Партии импорта", "Import batches", "Lô nhập")}</h2>
        <table className="erpTable erpMenuTable" data-testid="platform-import-batches">
          <thead>
            <tr>
              <th>{T("Файл", "File", "File")}</th>
              <th>{T("Формат", "Format", "Định dạng")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
              <th className="num">{T("Строк", "Rows", "Dòng")}</th>
            </tr>
          </thead>
          <tbody>
            {(batches as Array<Record<string, unknown>>).length === 0 ? (
              <tr>
                <td colSpan={4}>—</td>
              </tr>
            ) : (
              (batches as Array<Record<string, unknown>>).map((b) => (
                <tr key={String(b.id)}>
                  <td>{String(b.file_name ?? "—")}</td>
                  <td>{String(b.source_format)}</td>
                  <td>{String(b.status)}</td>
                  <td className="num">{String(b.row_count ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function LinesTable({ kind }: { kind: "commission" | "ads" }) {
  const { state } = useErp();
  const lines = useMemo(() => {
    const all = (state?.platformSettlementLines ?? []) as Array<Record<string, unknown>>;
    return all.filter((l) => {
      if (kind === "commission") return Number(l.platform_commission ?? 0) !== 0 || l.line_kind === "commission";
      return Number(l.advertising_expense ?? 0) !== 0 || l.line_kind === "advertising" || l.advertising_source;
    });
  }, [state?.platformSettlementLines, kind]);

  return (
    <table className="erpTable erpMenuTable">
      <thead>
        <tr>
          <th>{T("Order", "Order", "Order")}</th>
          <th className="num">{kind === "commission" ? "Commission" : "Ads"}</th>
          <th className="num">VAT</th>
          <th>{T("VAT статус", "VAT status", "VAT")}</th>
          <th>{T("Сверка", "Match", "Match")}</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={5}>—</td>
          </tr>
        ) : (
          lines.map((l) => (
            <tr key={String(l.id)}>
              <td>{String(l.external_order_id ?? l.operation_key)}</td>
              <td className="num">
                {vnd(Number(kind === "commission" ? l.platform_commission : l.advertising_expense) || null)}
              </td>
              <td className="num">
                {vnd(Number(kind === "commission" ? l.commission_vat : l.advertising_vat) || null)}
              </td>
              <td>{String(l.vat_deduction_status ?? "unverified")}</td>
              <td>{String(l.match_status)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function FinancePlatformCommissionPage() {
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Комиссии агрегатора", "Platform commission", "Hoa hồng sàn")} />
      <FinanceMobileNav active={FINANCE_HREFS.platforms} />
      <PlatformSubNav active="commission" />
      <p className="erpHint">
        {T(
          "Фактическая комиссия отделена от прогнозной ставки канала. НДС по умолчанию Unverified/Pending.",
          "Actual commission is separate from channel forecast %. VAT defaults to Unverified/Pending.",
          "Hoa hồng thực ≠ % dự báo. VAT mặc định Pending.",
        )}
      </p>
      <section className="erpMenuPanel">
        <LinesTable kind="commission" />
      </section>
    </div>
  );
}

export function FinancePlatformAdsPage() {
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Реклама агрегатора", "Platform advertising", "QC sàn")} />
      <FinanceMobileNav active={FINANCE_HREFS.platforms} />
      <PlatformSubNav active="ads" />
      <p className="erpHint">
        {T(
          "Не учитывать рекламу одновременно из settlement и ads report без сверки источников.",
          "Do not double-count advertising from settlement and ads report without source reconcile.",
          "Không tính kép QC từ settlement và ads report.",
        )}
      </p>
      <section className="erpMenuPanel">
        <LinesTable kind="ads" />
      </section>
    </div>
  );
}

export function FinancePlatformPayoutsPage() {
  const { state } = useErp();
  const payouts = (state?.platformPayouts ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Выплаты", "Payouts", "Chi trả")} />
      <FinanceMobileNav active={FINANCE_HREFS.platforms} />
      <PlatformSubNav active="payouts" />
      <p className="erpHint">
        {T(
          "Выплата Grab ≠ новая выручка. Ссылка на кассовую транзакцию без повторного создания денег.",
          "Grab payout ≠ new revenue. Link cashbook tx without recreating cash.",
          "Chi trả ≠ doanh thu mới.",
        )}
      </p>
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="platform-payouts">
          <thead>
            <tr>
              <th>{T("Дата", "Date", "Ngày")}</th>
              <th>{T("Reference", "Reference", "Ref")}</th>
              <th className="num">{T("Ожидалось", "Expected", "Dự kiến")}</th>
              <th className="num">{T("Факт", "Actual", "Thực")}</th>
              <th className="num">{T("Остаток", "Outstanding", "Còn")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 ? (
              <tr>
                <td colSpan={6}>—</td>
              </tr>
            ) : (
              payouts.map((p) => (
                <tr key={String(p.id)}>
                  <td>{String(p.payout_date)}</td>
                  <td>{String(p.payout_reference ?? p.payout_key)}</td>
                  <td className="num">{vnd(Number(p.expected_amount) || null)}</td>
                  <td className="num">{vnd(Number(p.actual_amount) || null)}</td>
                  <td className="num">{vnd(Number(p.outstanding_amount) || null)}</td>
                  <td>{String(p.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function FinancePlatformReconcilePage() {
  const { state } = useErp();
  const rows = (state?.platformReconciliation ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="erpMenu erpFinance">
      <PageHead title={T("Сверка", "Reconciliation", "Đối soát")} />
      <FinanceMobileNav active={FINANCE_HREFS.platforms} />
      <PlatformSubNav active="reconcile" />
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="platform-reconcile">
          <thead>
            <tr>
              <th>{T("Тип", "Kind", "Loại")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
              <th className="num">Poster</th>
              <th className="num">Grab</th>
              <th className="num">{T("Разница", "Diff", "Lệch")}</th>
              <th>{T("Причина", "Reason", "Lý do")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>—</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.kind)}</td>
                  <td>{String(r.status)}</td>
                  <td className="num">{vnd(Number(r.poster_amount) || null)}</td>
                  <td className="num">{vnd(Number(r.grab_amount) || null)}</td>
                  <td className="num">{vnd(Number(r.difference) || null)}</td>
                  <td>{String(r.reason ?? "—")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
