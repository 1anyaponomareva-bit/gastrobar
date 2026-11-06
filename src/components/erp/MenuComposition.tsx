"use client";

import { useEffect, useState } from "react";
import type { ErpCardEntity, ErpCardRevision } from "@/lib/erp/types";
import { dateTimeText, NavLink, T, vnd } from "./ui";

export type CompositionLineView = {
  name: string;
  prep?: boolean;
  gross: string;
  net: string;
  cost: number | null;
};

export type UsageLink = { href: string; name: string };

export type IngredientUsageRow = {
  href: string;
  name: string;
  gross: string;
  net: string;
  price?: number | null;
};

export function IngredientUsage({
  dishes,
  preps,
}: {
  dishes: IngredientUsageRow[];
  preps: IngredientUsageRow[];
}) {
  return (
    <div className="erpMenuUsageBlock">
      <h3>{T("Используется в тех. картах:", "Used in recipes:", "Dùng trong công thức:")}</h3>
      {dishes.length ? (
        <UsageMiniTable rows={dishes} price />
      ) : (
        <p className="erpHint">{T("Не используется в тех. картах", "Not used in recipes", "Không dùng trong công thức")}</p>
      )}
      {preps.length ? (
        <>
          <h3>{T("Используется в полуфабрикатах:", "Used in preps:", "Dùng trong bán thành phẩm:")}</h3>
          <UsageMiniTable rows={preps} />
        </>
      ) : null}
    </div>
  );
}

function UsageMiniTable({ rows, price }: { rows: IngredientUsageRow[]; price?: boolean }) {
  return (
    <div className="erpTableWrap">
      <table className="erpTable erpMenuTable">
        <thead>
          <tr>
            <th>{T("Название", "Name", "Tên")}</th>
            <th className="num">{T("Брутто", "Gross", "Brutto")}</th>
            <th className="num">{T("Нетто", "Net", "Netto")}</th>
            {price ? <th className="num">{T("Цена, ₫", "Price, ₫", "Giá, ₫")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.href}-${index}`}>
              <td>
                <NavLink href={row.href} className="erpName">
                  {row.name}
                </NavLink>
              </td>
              <td className="num">{row.gross}</td>
              <td className="num">{row.net}</td>
              {price ? <td className="num">{vnd(row.price ?? null)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompositionPanel({
  title,
  lines,
  usage,
  usageEmpty,
  historyEntity,
  historyId,
  onClose,
}: {
  title: string;
  lines?: CompositionLineView[];
  usage?: UsageLink[];
  usageEmpty?: string;
  historyEntity?: ErpCardEntity;
  historyId?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="erpMenuDrawer" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="erpMenuDrawerBack" aria-label={T("Закрыть", "Close", "Đóng")} onClick={onClose} />
      <aside className="erpMenuDrawerPanel">
        <header className="erpMenuDrawerHead">
          <strong>{title}</strong>
          <button type="button" className="erpIconBtn" aria-label={T("Закрыть", "Close", "Đóng")} onClick={onClose}>
            ×
          </button>
        </header>
        {usage ? (
          <section className="erpMenuDrawerBlock">
            <h3>{T("Где используется", "Used in", "Dùng trong")}</h3>
            {usage.length ? (
              <ul className="erpMenuUsage">
                {usage.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} className="erpName">
                      {item.name}
                    </NavLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="erpHint">{usageEmpty ?? T("Ещё нигде не используется", "Not used anywhere yet", "Chưa dùng ở đâu")}</p>
            )}
          </section>
        ) : null}
        {lines ? (
        <section className="erpMenuDrawerBlock">
          <h3>{T("Состав", "Composition", "Thành phần")}</h3>
          {lines.length ? (
            <div className="erpTableWrap">
              <table className="erpTable erpMenuTable">
                <thead>
                  <tr>
                    <th>{T("Ингредиент", "Ingredient", "Nguyên liệu")}</th>
                    <th className="num">{T("Брутто", "Gross", "Brutto")}</th>
                    <th className="num">{T("Нетто", "Net", "Netto")}</th>
                    <th className="num">{T("Себестоимость", "Cost", "Giá vốn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={`${line.name}-${index}`}>
                      <td>
                        {line.name}
                        {line.prep ? <span className="erpMenuPrep">{T("(п/ф)", "(prep)", "(bán TP)")}</span> : null}
                      </td>
                      <td className="num">{line.gross}</td>
                      <td className="num">{line.net}</td>
                      <td className={`num ${line.cost === 0 ? "erpCostZero" : ""}`}>{line.cost == null ? "—" : vnd(line.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="erpHint">{T("Состав пуст", "Composition is empty", "Chưa có thành phần")}</p>
          )}
        </section>
        ) : null}
        {historyEntity && historyId ? <CardHistory entity={historyEntity} id={historyId} /> : null}
      </aside>
    </div>
  );
}

export function CardHistory({ entity, id }: { entity: ErpCardEntity; id?: string | null }) {
  const [revisions, setRevisions] = useState<ErpCardRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setRevisions([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setRevisions(null);
    setError(null);
    fetch(`/api/erp/history?entity=${entity}&id=${encodeURIComponent(id)}&limit=50`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setRevisions([]);
          setError(
            T(
              "История карточки ещё недоступна (нет миграции).",
              "Card history is not available yet (migration missing).",
              "Lịch sử thẻ chưa có (chưa migration).",
            ),
          );
          return;
        }
        setRevisions((body?.revisions as ErpCardRevision[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setRevisions([]);
          setError(T("Не удалось загрузить историю.", "Could not load history.", "Không tải được lịch sử."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entity, id]);

  if (!id) return null;

  return (
    <section className="erpMenuDrawerBlock">
      <h3>{T("История редактирования", "Edit history", "Lịch sử sửa")}</h3>
      {revisions === null ? (
        <p className="erpHint">{T("Загрузка…", "Loading…", "Đang tải…")}</p>
      ) : error ? (
        <p className="erpHint">{error}</p>
      ) : !revisions.length ? (
        <p className="erpHint">{T("Сохранений пока нет.", "No saves yet.", "Chưa có lần lưu.")}</p>
      ) : (
        <div className="erpTableWrap">
          <table className="erpTable erpMenuTable">
            <thead>
              <tr>
                <th>{T("Когда", "When", "Khi")}</th>
                <th>{T("Действие", "Action", "Thao tác")}</th>
                <th>{T("Кто", "Who", "Ai")}</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((row) => (
                <tr key={row.id}>
                  <td>{dateTimeText(row.saved_at)}</td>
                  <td>{row.action}</td>
                  <td>{row.saved_by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
