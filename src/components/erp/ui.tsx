"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { productLabel, type ErpProductType, type ErpUnit } from "@/lib/erp/costing";
import type { ErpProduct, ErpState, ErpWarehouse } from "@/lib/erp/types";

/** Bilingual label in the same "English / Tiếng Việt" style as the Staff app. */
export const L = (en: string, vn: string) => `${en} / ${vn}`;

export const TYPE_LABELS: Record<ErpProductType, string> = {
  ingredient: L("Ingredient", "Nguyên liệu"),
  semi_finished: L("Semi-finished", "Bán thành phẩm"),
  finished: L("Finished", "Thành phẩm"),
  packaging: L("Packaging", "Bao bì"),
  consumable: L("Consumable", "Vật tư"),
};

export const DOC_LABELS: Record<string, string> = {
  opening: L("Opening balance", "Tồn đầu kỳ"),
  receipt: L("Receipt", "Nhập hàng"),
  transfer: L("Transfer", "Chuyển kho"),
  writeoff: L("Write-off", "Xuất hủy"),
  count: L("Inventory count", "Kiểm kê"),
  production: L("Production", "Sản xuất"),
};

export const STATUS_LABELS: Record<string, string> = {
  draft: L("Draft", "Nháp"),
  posted: L("Posted", "Đã ghi sổ"),
  cancelled: L("Cancelled", "Đã hủy"),
  active: L("Active", "Đang dùng"),
  archived: L("Archived", "Lưu trữ"),
};

const ERRORS: Record<string, string> = {
  ERP_INSUFFICIENT_STOCK: L("Not enough stock", "Không đủ tồn kho"),
  ERP_ALREADY_POSTED: L("Document is already posted", "Chứng từ đã được ghi sổ"),
  ERP_DOCUMENT_LOCKED: L("Posted documents cannot be edited", "Không thể sửa chứng từ đã ghi sổ"),
  ERP_NOT_POSTED: L("Document is not posted", "Chứng từ chưa ghi sổ"),
  ERP_CANCEL_BLOCKED: L("Stock from this document is already used by", "Hàng từ chứng từ này đã được dùng trong"),
  ERP_REASON_REQUIRED: L("Reason is required", "Cần nhập lý do"),
  ERP_EMPTY_DOCUMENT: L("Add at least one line", "Thêm ít nhất một dòng"),
  ERP_INVALID_QTY: L("Quantity must be greater than 0", "Số lượng phải lớn hơn 0"),
  ERP_PRODUCT_ARCHIVED: L("Product is archived", "Sản phẩm đã lưu trữ"),
  ERP_PRODUCT_NO_UNIT: L("Product has no base unit yet (see Review)", "Sản phẩm chưa có đơn vị cơ sở"),
  ERP_WAREHOUSE_REQUIRED: L("Choose a warehouse", "Chọn kho"),
  ERP_WAREHOUSE_ARCHIVED: L("Warehouse is archived", "Kho đã lưu trữ"),
  ERP_SAME_WAREHOUSE: L("Source and target warehouse must differ", "Kho nguồn và kho đích phải khác nhau"),
  ERP_RECIPE_CYCLE: L("A recipe cannot contain itself", "Công thức không thể chứa chính nó"),
  ERP_RECIPE_LOCKED: L("Only drafts can be changed", "Chỉ có thể sửa bản nháp"),
  ERP_RECIPE_UNRESOLVED: L("Unlinked ingredients", "Nguyên liệu chưa liên kết"),
  ERP_EMPTY_RECIPE: L("Recipe has no ingredients", "Công thức chưa có nguyên liệu"),
  ERP_HAS_STOCK: L("There is stock left; move or write it off first", "Vẫn còn tồn kho"),
  ERP_UNIT_LOCKED: L("Base unit cannot change once the product is used", "Không thể đổi đơn vị khi đã sử dụng"),
  ERP_DUPLICATE: L("Already exists", "Đã tồn tại"),
  ERP_STALE: L("Changed by someone else, reload the page", "Đã bị thay đổi, hãy tải lại"),
  ERP_INVALID: L("Check the fields", "Kiểm tra lại thông tin"),
  ERP_NOT_FOUND: L("Not found", "Không tìm thấy"),
  network: L("No connection", "Mất kết nối"),
  server: L("Server error", "Lỗi máy chủ"),
  ERP_NOT_INSTALLED: L(
    "ERP database is not installed yet: apply supabase/migrations/20261103120000_erp_v1.sql in Supabase SQL Editor",
    "Cơ sở dữ liệu ERP chưa được cài đặt: chạy migration erp_v1 trong Supabase SQL Editor",
  ),
  ERP_NOT_CONFIGURED: L("Server key for the database is not set", "Chưa cấu hình khóa máy chủ cho cơ sở dữ liệu"),
};

export function errorText(code: string, detail?: string): string {
  const text = ERRORS[code] ?? code;
  return detail ? `${text}: ${detail}` : text;
}

export const vnd = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value).toLocaleString("en-US")} ₫`;
export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${(Math.round(value * 10) / 10).toFixed(1)}%`;
export const qtyText = (value: number | null | undefined, unit?: string | null) =>
  value === null || value === undefined
    ? "—"
    : `${(Math.round(value * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;

export const num = (text: string): number | null => {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`erpField ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => {
    if (num(text) !== (value ?? null)) setText(value === null || value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => {
        setText(event.target.value);
        onChange(num(event.target.value));
      }}
    />
  );
}

const SUB_UNITS: Record<ErpUnit, { unit: string; factor: number }[]> = {
  kg: [
    { unit: "kg", factor: 1 },
    { unit: "g", factor: 0.001 },
  ],
  l: [
    { unit: "l", factor: 1 },
    { unit: "ml", factor: 0.001 },
  ],
  pcs: [{ unit: "pcs", factor: 1 }],
};

/** Quantity stored in the base unit; kg/l products can be typed in g/ml. */
export function QtyInput({
  base,
  value,
  onChange,
  disabled,
  defaultSmall,
}: {
  base: ErpUnit | null;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  defaultSmall?: boolean;
}) {
  const options = base ? SUB_UNITS[base] : [];
  const [unitIndex, setUnitIndex] = useState(defaultSmall && options.length > 1 ? 1 : 0);
  const factor = options[unitIndex]?.factor ?? 1;
  const shown = value === null || value === undefined ? null : Math.round((value / factor) * 1e6) / 1e6;
  return (
    <span className="erpQty">
      <NumberInput value={shown} disabled={disabled || !base} onChange={(v) => onChange(v === null ? null : v * factor)} />
      {options.length > 1 ? (
        <select value={unitIndex} disabled={disabled} onChange={(event) => setUnitIndex(Number(event.target.value))}>
          {options.map((option, index) => (
            <option key={option.unit} value={index}>
              {option.unit}
            </option>
          ))}
        </select>
      ) : (
        <span className="erpUnit">{base ?? "?"}</span>
      )}
    </span>
  );
}

export function productName(state: ErpState, id: string | null | undefined): string {
  const product = id ? state.products.find((p) => p.id === id) : undefined;
  return product ? productLabel(product) : "—";
}

export function warehouseName(state: ErpState, id: string | null | undefined): string {
  return (id && state.warehouses.find((w) => w.id === id)?.name) || "—";
}

/** Searchable product select (active products with a base unit unless `allowAll`). */
export function ProductPicker({
  state,
  value,
  onChange,
  types,
  allowAll,
  disabled,
}: {
  state: ErpState;
  value: string | null | undefined;
  onChange: (id: string) => void;
  types?: ErpProductType[];
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.products
      .filter((p) => (allowAll || (!p.archived_at && p.base_unit)) && (!types || types.includes(p.type)))
      .filter((p) => !q || p.id === value || `${p.name_en} ${p.name_vn} ${p.brand ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.name_en.localeCompare(b.name_en));
  }, [state.products, query, types, allowAll, value]);
  return (
    <span className="erpPicker">
      <input
        className="erpPickerSearch"
        value={query}
        disabled={disabled}
        placeholder="🔍"
        onChange={(event) => setQuery(event.target.value)}
      />
      <select value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{L("— choose —", "— chọn —")}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {productLabel(p)}
            {p.brand ? ` · ${p.brand}` : ""} ({p.base_unit ?? "?"})
          </option>
        ))}
      </select>
    </span>
  );
}

export function WarehouseSelect({
  warehouses,
  value,
  onChange,
  disabled,
}: {
  warehouses: ErpWarehouse[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <select value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{L("— choose —", "— chọn —")}</option>
      {warehouses
        .filter((w) => !w.archived_at || w.id === value)
        .map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
    </select>
  );
}

export function stockQty(state: ErpState, productId: string, warehouseId: string | null | undefined): number {
  if (!warehouseId) return 0;
  return state.stock.find((row) => row.product_id === productId && row.warehouse_id === warehouseId)?.qty ?? 0;
}

export const unitOf = (state: ErpState, productId: string | null | undefined): ErpUnit | null =>
  (productId && state.products.find((p) => p.id === productId)?.base_unit) || null;

export function productById(state: ErpState, id: string | null | undefined): ErpProduct | undefined {
  return id ? state.products.find((p) => p.id === id) : undefined;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Same rule as erp_to_base in the database: g→kg, ml→l, otherwise only the same unit. */
export function toBase(amount: number | null, unit: string | null, base: ErpUnit | null): number | null {
  if (amount === null || !unit || !base) return null;
  const u = unit.toLowerCase();
  if (u === base) return amount;
  if (base === "kg" && u === "g") return amount / 1000;
  if (base === "l" && u === "ml") return amount / 1000;
  if (base === "pcs" && ["pc", "piece", "pieces"].includes(u)) return amount;
  return null;
}
