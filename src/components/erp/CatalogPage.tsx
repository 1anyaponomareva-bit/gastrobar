"use client";

import { useMemo, useState } from "react";
import { buildCostContext, plannedUnitCost, productLabel, type ErpProductType, type ErpUnit } from "@/lib/erp/costing";
import type { ErpCategory, ErpPack, ErpProduct, ErpState, ErpSupplier } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { Field, L, NumberInput, TYPE_LABELS, vnd } from "./ui";

type Tab = "products" | "categories" | "suppliers";

export function CatalogPage() {
  const { state } = useErp();
  const [tab, setTab] = useState<Tab>("products");
  if (!state) return null;
  return (
    <>
      <h1>{L("Catalog", "Danh mục")}</h1>
      <div className="erpTabs">
        {(
          [
            ["products", L("Products", "Sản phẩm")],
            ["categories", L("Categories", "Nhóm hàng")],
            ["suppliers", L("Suppliers", "Nhà cung cấp")],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "products" ? <Products state={state} /> : tab === "categories" ? <Categories state={state} /> : <Suppliers state={state} />}
    </>
  );
}

function Products({ state }: { state: ErpState }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ErpProductType | "">("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<ErpProduct | "new" | null>(null);
  const ctx = useMemo(() => buildCostContext(state.products, state.recipes), [state]);
  const categories = new Map(state.categories.map((c) => [c.id, c]));

  const list = state.products.filter((p) => {
    if (Boolean(p.archived_at) !== archived) return false;
    if (type && p.type !== type) return false;
    const q = query.trim().toLowerCase();
    return !q || `${p.name_en} ${p.name_vn} ${p.brand ?? ""} ${p.code}`.toLowerCase().includes(q);
  });

  if (editing) {
    return <ProductForm state={state} product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;
  }

  return (
    <>
      <div className="erpToolbar">
        <input placeholder={L("Search", "Tìm")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={type} onChange={(event) => setType(event.target.value as ErpProductType | "")}>
          <option value="">{L("All types", "Tất cả loại")}</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="erpCheck">
          <input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
          {L("Archive", "Lưu trữ")}
        </label>
        <button type="button" className="erpBtn primary" onClick={() => setEditing("new")}>
          + {L("Product", "Sản phẩm")}
        </button>
      </div>
      <div className="erpTableWrap">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{L("Name", "Tên")}</th>
              <th>{L("Type", "Loại")}</th>
              <th>{L("Category", "Nhóm")}</th>
              <th>{L("Unit", "ĐV")}</th>
              <th className="num">{L("Cost / unit", "Giá vốn / ĐV")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const cost = p.base_unit ? plannedUnitCost(ctx, p.id) : null;
              return (
                <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                  <td>
                    {productLabel(p)}
                    {p.brand ? <small> · {p.brand}</small> : null}
                  </td>
                  <td>{TYPE_LABELS[p.type]}</td>
                  <td>{p.category_id ? categories.get(p.category_id)?.name_en : "—"}</td>
                  <td>{p.base_unit ?? <span className="erpBadge warn">?</span>}</td>
                  <td className="num">{cost === null ? <span className="erpBadge warn">{L("no price", "chưa có giá")}</span> : vnd(cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!list.length ? <div className="erpEmpty">{L("Nothing found", "Không có kết quả")}</div> : null}
    </>
  );
}

type PackDraft = Pick<ErpPack, "label" | "qty_base" | "is_default" | "supplier_id"> & { id?: string };

function ProductForm({ state, product, onClose }: { state: ErpState; product: ErpProduct | null; onClose: () => void }) {
  const { act, busy } = useErp();
  const [form, setForm] = useState({
    name_en: product?.name_en ?? "",
    name_vn: product?.name_vn ?? "",
    type: product?.type ?? ("ingredient" as ErpProductType),
    category_id: product?.category_id ?? "",
    base_unit: product?.base_unit ?? ("" as ErpUnit | ""),
    unit_weight_kg: product?.unit_weight_kg ?? null,
    brand: product?.brand ?? "",
    est_unit_cost: product?.est_unit_cost ?? null,
    shelf_life_days: product?.shelf_life_days ?? null,
    storage_conditions: product?.storage_conditions ?? "",
  });
  const [packs, setPacks] = useState<PackDraft[]>(() => state.packs.filter((pack) => pack.product_id === product?.id));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const result = await act<{ id: string }>({
      action: "saveProduct",
      product: { ...form, id: product?.id, base_unit: form.base_unit || null, packs },
    });
    if (result) onClose();
  };

  const archive = async (archived: boolean) => {
    if (product && (await act({ action: "setArchived", entity: "product", id: product.id, archived }))) onClose();
  };

  return (
    <div className="erpCard">
      <h2 style={{ marginTop: 0 }}>{product ? productLabel(product) : L("New product", "Sản phẩm mới")}</h2>
      {product?.staff_listed ? (
        <p className="erpHint">
          {L("Listed in the Staff order app as", "Có trong Staff:")} {product.code} · {product.staff_unit} {product.staff_pack ?? ""}
        </p>
      ) : null}
      <div className="erpGrid">
        <Field label={L("Name EN *", "Tên EN *")}>
          <input value={form.name_en} onChange={(event) => set("name_en", event.target.value)} />
        </Field>
        <Field label={L("Name VN", "Tên VN")}>
          <input value={form.name_vn} onChange={(event) => set("name_vn", event.target.value)} />
        </Field>
        <Field label={L("Type", "Loại")}>
          <select value={form.type} onChange={(event) => set("type", event.target.value as ErpProductType)}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L("Category", "Nhóm")}>
          <select value={form.category_id} onChange={(event) => set("category_id", event.target.value)}>
            <option value="">—</option>
            {state.categories
              .filter((c) => !c.archived_at || c.id === form.category_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_en}
                  {c.name_vn && c.name_vn !== c.name_en ? ` / ${c.name_vn}` : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label={L("Base unit", "Đơn vị cơ sở")}>
          <select value={form.base_unit} onChange={(event) => set("base_unit", event.target.value as ErpUnit | "")}>
            <option value="">{L("— not set —", "— chưa chọn —")}</option>
            <option value="kg">kg</option>
            <option value="l">l</option>
            <option value="pcs">pcs</option>
          </select>
        </Field>
        <Field label={L("Weight of 1 pc, kg", "Trọng lượng 1 cái, kg")}>
          <NumberInput value={form.unit_weight_kg} onChange={(v) => set("unit_weight_kg", v)} />
        </Field>
        <Field label={L("Brand", "Thương hiệu")}>
          <input value={form.brand} onChange={(event) => set("brand", event.target.value)} />
        </Field>
        <Field label={`${L("Estimated cost per", "Giá ước tính mỗi")} ${form.base_unit || "?"}, ₫`}>
          <NumberInput value={form.est_unit_cost} onChange={(v) => set("est_unit_cost", v)} />
        </Field>
        <Field label={L("Shelf life, days", "Hạn dùng, ngày")}>
          <NumberInput value={form.shelf_life_days} onChange={(v) => set("shelf_life_days", v === null ? null : Math.round(v))} />
        </Field>
        <Field label={L("Storage conditions", "Điều kiện bảo quản")} wide>
          <input value={form.storage_conditions} onChange={(event) => set("storage_conditions", event.target.value)} />
        </Field>
      </div>
      {product?.est_cost_source ? (
        <p className="erpHint">
          {product.est_cost_source === "receipt" ? L("Estimate from the last receipt", "Theo lần nhập gần nhất") : L("Manual estimate", "Nhập tay")}
          {product.est_cost_at ? ` · ${product.est_cost_at.slice(0, 10)}` : ""}
        </p>
      ) : null}

      <h2>{L("Purchase packs", "Quy cách mua")}</h2>
      <p className="erpHint">{L("How many base units are in one pack (e.g. box = 5 kg).", "Một quy cách bằng bao nhiêu đơn vị cơ sở.")}</p>
      <div className="erpTableWrap">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{L("Pack", "Quy cách")}</th>
              <th>{L("Supplier", "Nhà cung cấp")}</th>
              <th>
                {L("Qty in", "Số lượng")} {form.base_unit || "?"}
              </th>
              <th>{L("Default", "Mặc định")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {packs.map((pack, index) => (
              <tr key={pack.id ?? `new-${index}`}>
                <td>
                  <input
                    value={pack.label}
                    onChange={(event) => setPacks((prev) => prev.map((p, i) => (i === index ? { ...p, label: event.target.value } : p)))}
                  />
                </td>
                <td>
                  <select
                    value={pack.supplier_id ?? ""}
                    onChange={(event) =>
                      setPacks((prev) => prev.map((p, i) => (i === index ? { ...p, supplier_id: event.target.value || null } : p)))
                    }
                  >
                    <option value="">—</option>
                    {state.suppliers
                      .filter((s) => !s.archived_at || s.id === pack.supplier_id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <NumberInput
                    value={pack.qty_base}
                    onChange={(v) => setPacks((prev) => prev.map((p, i) => (i === index ? { ...p, qty_base: v ?? 0 } : p)))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={pack.is_default}
                    onChange={(event) =>
                      setPacks((prev) => prev.map((p, i) => ({ ...p, is_default: i === index ? event.target.checked : false })))
                    }
                  />
                </td>
                <td>
                  <button type="button" className="erpLink" onClick={() => setPacks((prev) => prev.filter((_, i) => i !== index))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn"
          onClick={() => setPacks((prev) => [...prev, { label: "", qty_base: 0, is_default: !prev.length, supplier_id: product?.staff_supplier_id ?? null }])}
        >
          + {L("Pack", "Quy cách")}
        </button>
      </div>

      <div className="erpActions">
        <button type="button" className="erpBtn primary" disabled={busy || !form.name_en.trim()} onClick={save}>
          {L("Save", "Lưu")}
        </button>
        <button type="button" className="erpBtn" onClick={onClose}>
          {L("Back", "Quay lại")}
        </button>
        {product ? (
          <button type="button" className="erpBtn danger" disabled={busy} onClick={() => archive(!product.archived_at)}>
            {product.archived_at ? L("Restore", "Khôi phục") : L("Archive", "Lưu trữ")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Categories({ state }: { state: ErpState }) {
  return (
    <RefList<ErpCategory>
      entity="category"
      rows={state.categories}
      columns={[
        { key: "name_en", label: L("Name EN", "Tên EN") },
        { key: "name_vn", label: L("Name VN", "Tên VN") },
      ]}
    />
  );
}

function Suppliers({ state }: { state: ErpState }) {
  return (
    <RefList<ErpSupplier>
      entity="supplier"
      rows={state.suppliers}
      columns={[
        { key: "name", label: L("Name", "Tên") },
        { key: "zalo_url", label: "Zalo (https://…)" },
      ]}
    />
  );
}

type RefRow = { id: string; archived_at: string | null };

/** Inline-editable list for categories and suppliers. */
export function RefList<T extends RefRow>({
  entity,
  rows,
  columns,
}: {
  entity: "category" | "supplier" | "warehouse" | "channel";
  rows: T[];
  columns: { key: keyof T & string; label: string; kind?: "number" | "select"; options?: [string, string][] }[];
}) {
  const { act, busy } = useErp();
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [adding, setAdding] = useState<Record<string, unknown> | null>(null);

  const valueOf = (row: T, key: string) => (drafts[row.id]?.[key] ?? (row as Record<string, unknown>)[key] ?? "") as string | number;
  const edit = (id: string, key: string, value: unknown) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  const toPayload = (values: Record<string, unknown>) => {
    const payload: Record<string, unknown> = { ...values };
    if ("name_en" in payload) payload.name = payload.name_en;
    return payload;
  };

  const input = (value: string | number, onChange: (v: unknown) => void, column: (typeof columns)[number]) =>
    column.kind === "number" ? (
      <NumberInput value={value === "" ? null : Number(value)} onChange={onChange} />
    ) : column.kind === "select" ? (
      <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {column.options?.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    ) : (
      <input value={String(value)} onChange={(event) => onChange(event.target.value)} />
    );

  return (
    <>
      <div className="erpTableWrap">
        <table className="erpTable">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.archived_at ? "muted" : ""}>
                {columns.map((column) => (
                  <td key={column.key}>{input(valueOf(row, column.key), (v) => edit(row.id, column.key, v), column)}</td>
                ))}
                <td>
                  <div className="erpRow">
                    {drafts[row.id] ? (
                      <button
                        type="button"
                        className="erpBtn primary"
                        disabled={busy}
                        onClick={async () => {
                          const values = Object.fromEntries(columns.map((c) => [c.key, valueOf(row, c.key)]));
                          if (await act({ action: "saveRef", entity, value: { id: row.id, ...toPayload(values) } })) {
                            setDrafts((prev) => {
                              const next = { ...prev };
                              delete next[row.id];
                              return next;
                            });
                          }
                        }}
                      >
                        {L("Save", "Lưu")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="erpBtn"
                      disabled={busy}
                      onClick={() => act({ action: "setArchived", entity, id: row.id, archived: !row.archived_at })}
                    >
                      {row.archived_at ? L("Restore", "Khôi phục") : L("Archive", "Lưu trữ")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {adding ? (
              <tr>
                {columns.map((column) => (
                  <td key={column.key}>
                    {input(
                      (adding[column.key] as string | number) ?? "",
                      (v) => setAdding((prev) => ({ ...prev, [column.key]: v })),
                      column,
                    )}
                  </td>
                ))}
                <td>
                  <div className="erpRow">
                    <button
                      type="button"
                      className="erpBtn primary"
                      disabled={busy}
                      onClick={async () => {
                        if (await act({ action: "saveRef", entity, value: toPayload(adding) })) setAdding(null);
                      }}
                    >
                      {L("Add", "Thêm")}
                    </button>
                    <button type="button" className="erpBtn" onClick={() => setAdding(null)}>
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!adding ? (
        <div className="erpActions">
          <button
            type="button"
            className="erpBtn"
            onClick={() =>
              setAdding(Object.fromEntries(columns.filter((c) => c.kind === "select").map((c) => [c.key, c.options?.[0]?.[0] ?? ""])))
            }
          >
            + {L("Add", "Thêm")}
          </button>
        </div>
      ) : null}
    </>
  );
}
