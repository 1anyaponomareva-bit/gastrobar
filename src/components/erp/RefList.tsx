"use client";

import { useState, type ReactNode } from "react";
import { useErp } from "./ErpShell";
import { Empty, NumberInput, T, useDirtyGuard } from "./ui";

type RefRow = { id: string; archived_at: string | null };

export type RefColumn<Row> = {
  key: keyof Row & string;
  label: string;
  kind?: "number" | "select";
  options?: [string, string][];
  placeholder?: string;
};

/** Inline-editable list for categories, suppliers, warehouses and sales channels. */
export function RefList<Row extends RefRow>({
  entity,
  rows,
  columns,
  emptyTitle,
  emptyText,
  addLabel,
}: {
  entity: "category" | "supplier" | "warehouse" | "channel";
  rows: Row[];
  columns: RefColumn<Row>[];
  emptyTitle: string;
  emptyText: ReactNode;
  addLabel: string;
}) {
  const { act, busy } = useErp();
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [adding, setAdding] = useState<Record<string, unknown> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useDirtyGuard(Object.keys(drafts).length > 0 || Boolean(adding && Object.values(adding).some((v) => v !== "" && v !== null)));

  const valueOf = (row: Row, key: string) => (drafts[row.id]?.[key] ?? (row as Record<string, unknown>)[key] ?? "") as string | number;
  const edit = (id: string, key: string, value: unknown) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  const dropDraft = (id: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const toPayload = (values: Record<string, unknown>) => {
    const payload: Record<string, unknown> = { ...values };
    if ("name_en" in payload) payload.name = payload.name_en;
    return payload;
  };
  const filled = (values: Record<string, unknown>) => String(values[columns[0].key] ?? "").trim() !== "";

  const input = (value: string | number, onChange: (v: unknown) => void, column: RefColumn<Row>) =>
    column.kind === "number" ? (
      <NumberInput value={value === "" ? null : Number(value)} placeholder={column.placeholder} onChange={onChange} />
    ) : column.kind === "select" ? (
      <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {column.options?.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    ) : (
      <input value={String(value)} placeholder={column.placeholder} onChange={(event) => onChange(event.target.value)} />
    );

  const archivedCount = rows.filter((row) => row.archived_at).length;
  const visible = rows.filter((row) => showArchived || !row.archived_at);

  return (
    <>
      {!visible.length && !adding ? (
        <Empty
          title={emptyTitle}
          text={emptyText}
          action={
            <button type="button" className="erpBtn primary" onClick={() => setAdding({})}>
              + {addLabel}
            </button>
          }
        />
      ) : (
        <div className="erpTableWrap">
          <table className="erpTable stack">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={row.archived_at ? "muted" : ""}>
                  {columns.map((column, index) => (
                    <td key={column.key} className={index === 0 ? "main" : "edit"} data-label={index === 0 ? undefined : column.label}>
                      {input(valueOf(row, column.key), (v) => edit(row.id, column.key, v), column)}
                    </td>
                  ))}
                  <td className="num">
                    <div className="erpRow end">
                      {drafts[row.id] ? (
                        <>
                          <button
                            type="button"
                            className="erpBtn small primary"
                            disabled={busy}
                            onClick={async () => {
                              const values = Object.fromEntries(columns.map((c) => [c.key, valueOf(row, c.key)]));
                              if (await act({ action: "saveRef", entity, value: { id: row.id, ...toPayload(values) } })) dropDraft(row.id);
                            }}
                          >
                            {T("Сохранить", "Save", "Lưu")}
                          </button>
                          <button type="button" className="erpBtn small ghost" onClick={() => dropDraft(row.id)}>
                            {T("Отмена", "Cancel", "Hủy")}
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="erpBtn small ghost"
                        disabled={busy}
                        onClick={() =>
                          act(
                            { action: "setArchived", entity, id: row.id, archived: !row.archived_at },
                            row.archived_at ? T("Восстановлено", "Restored", "Đã khôi phục") : T("Перенесено в архив", "Archived", "Đã lưu trữ"),
                          )
                        }
                      >
                        {row.archived_at ? T("Восстановить", "Restore", "Khôi phục") : T("В архив", "Archive", "Lưu trữ")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {adding ? (
                <tr>
                  {columns.map((column, index) => (
                    <td key={column.key} className={index === 0 ? "main" : "edit"} data-label={index === 0 ? undefined : column.label}>
                      {input((adding[column.key] as string | number) ?? "", (v) => setAdding((prev) => ({ ...prev, [column.key]: v })), column)}
                    </td>
                  ))}
                  <td className="num">
                    <div className="erpRow end">
                      <button
                        type="button"
                        className="erpBtn small primary"
                        disabled={busy || !filled(adding)}
                        onClick={async () => {
                          if (await act({ action: "saveRef", entity, value: toPayload(adding) }, T("Добавлено", "Added", "Đã thêm"))) setAdding(null);
                        }}
                      >
                        {T("Добавить", "Add", "Thêm")}
                      </button>
                      <button type="button" className="erpBtn small ghost" onClick={() => setAdding(null)}>
                        {T("Отмена", "Cancel", "Hủy")}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <div className="erpActions">
        {!adding && visible.length ? (
          <button
            type="button"
            className="erpBtn"
            onClick={() => setAdding(Object.fromEntries(columns.filter((c) => c.kind === "select").map((c) => [c.key, c.options?.[0]?.[0] ?? ""])))}
          >
            + {addLabel}
          </button>
        ) : null}
        {archivedCount ? (
          <label className="erpCheck">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            {T("Показать архив", "Show archived", "Hiện lưu trữ")} ({archivedCount})
          </label>
        ) : null}
      </div>
    </>
  );
}
