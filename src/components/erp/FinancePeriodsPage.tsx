"use client";

import { useMemo, useState } from "react";
import { currentYearMonth, monthRange } from "@/lib/erp/finance";
import { useErp } from "./ErpShell";
import { FinanceMobileNav, FINANCE_HREFS } from "./financeNav";
import { Field, NavLink, PageHead, savingText, T, vnd } from "./ui";

function SubNav({ active }: { active: "periods" | "audit" | "corrections" }) {
  const items = [
    { id: "periods", href: FINANCE_HREFS.periods, label: T("Периоды", "Periods", "Kỳ") },
    { id: "corrections", href: `${FINANCE_HREFS.periods}/corrections`, label: T("Корректировки", "Corrections", "Điều chỉnh") },
    { id: "audit", href: FINANCE_HREFS.audit, label: T("Аудит", "Audit", "Audit") },
  ] as const;
  return (
    <nav className="erpSubTabs" aria-label="Financial periods">
      {items.map((t) => (
        <NavLink key={t.id} href={t.href} className={t.id === active ? "active" : ""}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function FinancePeriodsPage() {
  const { state, act, busy } = useErp();
  const periods = (state?.financialPeriods ?? []) as Array<Record<string, unknown>>;
  const checks = (state?.periodCloseChecks ?? []) as Array<Record<string, unknown>>;
  const snapshots = (state?.periodSnapshots ?? []) as Array<Record<string, unknown>>;
  const [month, setMonth] = useState(currentYearMonth);
  const [checklist, setChecklist] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const selectedSnaps = snapshots.filter((s) => String(s.period_id) === selected);
  const selectedChecks = checks.filter((c) => String(c.period_id) === selected);

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Финансовые периоды", "Financial periods", "Kỳ tài chính")}
        sub={T(
          "Закрытие управленческого периода. Независимо от налоговых периодов НДС (9E). Closed блокирует правки истории.",
          "Management period close. Independent of VAT tax periods (9E). Closed blocks historical edits.",
          "Đóng kỳ quản trị. Độc lập với kỳ VAT.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.periods} />
      <SubNav active="periods" />
      <div className="erpFinancePeriod" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>
          {T("Месяц", "Month", "Tháng")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy}
          onClick={() =>
            void act({
              action: "saveFinancialPeriod",
              value: { period_start: from, period_end: to, period_name: month },
            })
          }
        >
          {busy ? savingText() : T("Открыть период", "Open period", "Mở kỳ")}
        </button>
      </div>
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="financial-periods-table">
          <thead>
            <tr>
              <th>{T("Период", "Period", "Kỳ")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
              <th>{T("Полнота", "Completeness", "Đầy đủ")}</th>
              <th className="num">Ver</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr key={String(p.id)}>
                  <td>
                    {String(p.period_name)} · {String(p.period_start)} → {String(p.period_end)}
                  </td>
                  <td>{String(p.status)}</td>
                  <td>{String(p.data_completeness ?? "—")}</td>
                  <td className="num">{String(p.closing_version ?? 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="erpBtn"
                      disabled={busy}
                      onClick={() => {
                        setSelected(String(p.id));
                        void act({ action: "periodCloseChecklist", id: String(p.id) }, false).then((res) => {
                          if (res) setChecklist(res as Record<string, unknown>);
                        });
                      }}
                    >
                      Checklist
                    </button>{" "}
                    {p.status !== "closed" ? (
                      <button
                        type="button"
                        className="erpBtn primary"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: "closeFinancialPeriod",
                            id: String(p.id),
                            value: { ack_warnings: true, ack_reason: "Owner acknowledged warnings for close" },
                          }).then(() => setChecklist(null))
                        }
                      >
                        {T("Закрыть", "Close", "Đóng")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="erpBtn"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt(
                            T("Причина переоткрытия", "Reopen reason", "Lý do mở lại") || "reason",
                          );
                          if (!reason) return;
                          void act({ action: "reopenFinancialPeriod", id: String(p.id), value: { reason } });
                        }}
                      >
                        {T("Переоткрыть", "Reopen", "Mở lại")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      {checklist ? (
        <section className="erpMenuPanel">
          <h3>
            Checklist · blocking {String(checklist.blocking_error_count)} · warnings {String(checklist.warning_count)}
          </h3>
          <ul>
            {((checklist.checks as Array<Record<string, unknown>>) || []).map((c, i) => (
              <li key={i}>
                <strong>{String(c.severity)}</strong> [{String(c.check_code)}] {String(c.message)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {selected ? (
        <section className="erpMenuPanel">
          <h3>
            {T("Снимки / проверки", "Snapshots / checks", "Snapshot")} · {selected.slice(0, 8)}
          </h3>
          <p className="erpHint">
            Checks: {selectedChecks.length} · Snapshots: {selectedSnaps.length} (immutable after close)
          </p>
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>Kind</th>
                <th className="num">Ver</th>
                <th>{T("Полнота", "Completeness", "Đầy đủ")}</th>
              </tr>
            </thead>
            <tbody>
              {selectedSnaps.length === 0 ? (
                <tr>
                  <td colSpan={3}>—</td>
                </tr>
              ) : (
                selectedSnaps.map((s) => (
                  <tr key={String(s.id)}>
                    <td>{String(s.report_kind)}</td>
                    <td className="num">{String(s.report_version)}</td>
                    <td>{String(s.data_completeness ?? "—")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

export function FinanceCorrectionsPage() {
  const { state, act, busy } = useErp();
  const rows = (state?.financialCorrections ?? []) as Array<Record<string, unknown>>;
  const periods = (state?.financialPeriods ?? []) as Array<Record<string, unknown>>;
  const [amount, setAmount] = useState("1000");
  const [reason, setReason] = useState("period correction");
  const openPeriod = periods.find((p) => p.status === "open" || p.status === "reopened");

  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Финансовые корректировки", "Financial corrections", "Điều chỉnh tài chính")}
        sub={T(
          "Не переписывают исходные документы закрытого периода. Recognition — в открытом/переоткрытом периоде.",
          "Do not rewrite closed-period originals. Recognition in open/reopened period.",
          "Không sửa chứng từ kỳ đã đóng.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.periods} />
      <SubNav active="corrections" />
      <div className="erpActions" style={{ gap: 8, flexWrap: "wrap", display: "flex" }}>
        <Field label={T("Сумма", "Amount", "Số tiền")}>
          <input className="erpInput" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={T("Причина", "Reason", "Lý do")}>
          <input className="erpInput" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy || !openPeriod}
          onClick={() =>
            void act({
              action: "saveFinancialCorrection",
              value: {
                correction_kind: "expense",
                adjustment_amount: Number(amount),
                adjustment_reason: reason,
                recognition_period_id: openPeriod?.id,
              },
            })
          }
        >
          {busy ? savingText() : T("Создать", "Create", "Tạo")}
        </button>
      </div>
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable">
          <thead>
            <tr>
              <th>{T("Вид", "Kind", "Loại")}</th>
              <th className="num">{T("Сумма", "Amount", "Số tiền")}</th>
              <th>{T("Причина", "Reason", "Lý do")}</th>
              <th>{T("Статус", "Status", "TT")}</th>
              <th></th>
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
                  <td>{String(r.correction_kind)}</td>
                  <td className="num">{vnd(Number(r.adjustment_amount) || null)}</td>
                  <td>{String(r.adjustment_reason)}</td>
                  <td>{String(r.status)}</td>
                  <td>
                    {r.status === "draft" ? (
                      <button
                        type="button"
                        className="erpBtn"
                        disabled={busy}
                        onClick={() => void act({ action: "postFinancialCorrection", id: String(r.id) })}
                      >
                        Post
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function FinanceAuditPage() {
  const { state } = useErp();
  const rows = (state?.auditLog ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="erpMenu erpFinance">
      <PageHead
        title={T("Журнал аудита", "Audit log", "Nhật ký audit")}
        sub={T(
          "Только append. Пароли/токены не хранятся. Закрытие/переоткрытие фиксируются.",
          "Append-only. Passwords/tokens never stored. Close/reopen recorded.",
          "Chỉ ghi thêm. Không lưu mật khẩu.",
        )}
      />
      <FinanceMobileNav active={FINANCE_HREFS.audit} />
      <SubNav active="audit" />
      <section className="erpMenuPanel">
        <table className="erpTable erpMenuTable" data-testid="audit-log-table">
          <thead>
            <tr>
              <th>{T("Время", "Time", "Giờ")}</th>
              <th>{T("Актор", "Actor", "Actor")}</th>
              <th>{T("Сущность", "Entity", "Đối tượng")}</th>
              <th>{T("Действие", "Action", "HĐ")}</th>
              <th>{T("Причина", "Reason", "Lý do")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              rows.slice(0, 300).map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.at ?? r.created_at ?? "").slice(0, 19)}</td>
                  <td>{String(r.actor)}</td>
                  <td>
                    {String(r.entity)} {r.entity_id ? String(r.entity_id).slice(0, 8) : ""}
                  </td>
                  <td>{String(r.action)}</td>
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
