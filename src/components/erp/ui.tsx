"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { useErpHref } from "./erpHref";
import { productTitle, type CostSource, type ErpProductType, type ErpUnit } from "@/lib/erp/costing";
import type { ErpDocType, ErpProduct, ErpState, ErpWarehouse } from "@/lib/erp/types";
import { locale, T } from "./i18n";

export { T } from "./i18n";

export const typeLabel = (type: ErpProductType) =>
  ({
    ingredient: T("Сырьё", "Ingredient", "Nguyên liệu"),
    semi_finished: T("Полуфабрикат", "Semi-finished", "Bán thành phẩm"),
    finished: T("Готовое изделие", "Finished product", "Thành phẩm"),
    packaging: T("Упаковка", "Packaging", "Bao bì"),
    consumable: T("Расходник", "Consumable", "Vật tư"),
  })[type];

export const PRODUCT_TYPES: ErpProductType[] = ["ingredient", "semi_finished", "finished", "packaging", "consumable"];

export const docLabel = (type: ErpDocType) =>
  ({
    opening: T("Начальный остаток", "Opening balance", "Tồn đầu kỳ"),
    receipt: T("Поставка", "Delivery", "Nhập hàng"),
    transfer: T("Перемещение", "Transfer", "Chuyển kho"),
    writeoff: T("Списание", "Write-off", "Xuất hủy"),
    count: T("Инвентаризация", "Stock count", "Kiểm kê"),
    production: T("Производство", "Production", "Sản xuất"),
  })[type];

export const statusLabel = (status: string) =>
  ({
    draft: T("Черновик", "Draft", "Nháp"),
    posted: T("Проведён", "Completed", "Đã ghi sổ"),
    cancelled: T("Отменён", "Cancelled", "Đã hủy"),
    active: T("Действует", "Active", "Đang dùng"),
    archived: T("В архиве", "Archived", "Lưu trữ"),
  })[status] ?? status;

/** Display name of a unit; storage always stays kg / l / pcs. */
export const unitLabel = (unit: string | null | undefined) =>
  !unit
    ? ""
    : (
        {
          kg: T("кг", "kg", "kg"),
          g: T("г", "g", "g"),
          l: T("л", "l", "l"),
          ml: T("мл", "ml", "ml"),
          pcs: T("шт", "pcs", "cái"),
        } as Record<string, string>
      )[unit] ?? unit;

export const costSourceLabel = (source: CostSource | null | undefined) =>
  source === "receipt"
    ? T("по последней поставке", "from last delivery", "theo lần nhập gần nhất")
    : source === "manual"
      ? T("введена вручную", "entered manually", "nhập tay")
      : source === "recipe"
        ? T("по рецептуре", "from recipe", "theo công thức")
        : source === "last_lot"
          ? T("по последней партии", "from last lot", "theo lô gần nhất")
          : source === "fifo_remaining"
            ? T("по остатку FIFO", "from remaining FIFO", "theo tồn FIFO")
            : source === "reference"
              ? T("плановая цена карточки", "card reference price", "giá tham chiếu")
              : "";

export function errorText(code: string, detail?: string): string {
  const texts: Record<string, string> = {
    ERP_INSUFFICIENT_STOCK: T("Недостаточно остатка", "Not enough stock", "Không đủ tồn kho"),
    ERP_ALREADY_POSTED: T("Документ уже проведён", "Already completed", "Chứng từ đã được ghi sổ"),
    ERP_DOCUMENT_LOCKED: T("Проведённый документ нельзя изменить", "A completed document cannot be edited", "Không thể sửa chứng từ đã ghi sổ"),
    ERP_NOT_POSTED: T("Документ ещё не проведён", "The document is not completed", "Chứng từ chưa ghi sổ"),
    ERP_CANCEL_BLOCKED: T(
      "Нельзя отменить: продукты из этого документа уже использованы в",
      "Cannot cancel: products from this document are already used in",
      "Không thể hủy: hàng đã được dùng trong",
    ),
    ERP_REASON_REQUIRED: T("Укажите причину", "Enter a reason", "Cần nhập lý do"),
    ERP_REASON_ARCHIVED: T("Эта причина в архиве — выберите другую", "This reason is archived — choose another", "Lý do đã lưu trữ — chọn lý do khác"),
    ERP_EMPTY_DOCUMENT: T("Добавьте хотя бы один продукт", "Add at least one product", "Thêm ít nhất một sản phẩm"),
    ERP_INVALID_QTY: T("Количество должно быть больше нуля", "Quantity must be greater than 0", "Số lượng phải lớn hơn 0"),
    ERP_PRODUCT_ARCHIVED: T("Продукт в архиве", "The product is archived", "Sản phẩm đã lưu trữ"),
    ERP_PRODUCT_NO_UNIT: T("У продукта не выбрана единица учёта", "The product has no unit yet", "Sản phẩm chưa có đơn vị"),
    ERP_WAREHOUSE_REQUIRED: T("Выберите склад", "Choose a location", "Chọn kho"),
    ERP_WAREHOUSE_ARCHIVED: T("Склад в архиве", "The location is archived", "Kho đã lưu trữ"),
    ERP_SAME_WAREHOUSE: T("Склады «откуда» и «куда» должны отличаться", "From and to must be different", "Kho đi và kho đến phải khác nhau"),
    ERP_RECIPE_CYCLE: T("Рецептура не может содержать саму себя", "A recipe cannot contain itself", "Công thức không thể chứa chính nó"),
    ERP_RECIPE_LOCKED: T("Изменять можно только черновик рецептуры", "Only a draft recipe can be changed", "Chỉ có thể sửa bản nháp"),
    ERP_RECIPE_UNRESOLVED: T(
      "Есть ингредиенты без привязки к продукту",
      "Some ingredients are not linked to products",
      "Có nguyên liệu chưa liên kết",
    ),
    ERP_EMPTY_RECIPE: T("В рецептуре нет ингредиентов", "The recipe has no ingredients", "Công thức chưa có nguyên liệu"),
    ERP_HAS_STOCK: T(
      "На складе ещё есть остаток — сначала переместите или спишите его",
      "There is stock left — move or write it off first",
      "Vẫn còn tồn kho",
    ),
    ERP_CATEGORY_HAS_STOCK: T(
      "Нельзя удалить категорию: на складах ещё есть остаток. Сначала спишите или переместите его.",
      "Cannot delete this category: stock remains on warehouses. Write it off or move it first.",
      "Không thể xóa nhóm: vẫn còn tồn kho. Hãy xuất hoặc chuyển trước.",
    ),
    ERP_LOCATION_IN_USE: T(
      "Нельзя удалить точку продаж: к ней привязан ассортимент или документы.",
      "Cannot delete this sales location: assortment or documents are still tied to it.",
      "Không thể xóa điểm bán: còn gắn hàng hoặc chứng từ.",
    ),
    ERP_TRASH_EXPIRED: T(
      "Срок хранения в «Удалённые» истёк (14 дней).",
      "The 14-day trash period has expired.",
      "Hết hạn 14 ngày trong thùng rác.",
    ),
    ERP_FINANCE_SYSTEM: T(
      "Базовый счёт или категорию Poster нельзя удалить",
      "A Poster system account or category cannot be deleted",
      "Không xóa được tài khoản/nhóm mặc định của Poster",
    ),
    ERP_FINANCE_LOCKED: T(
      "Эту транзакцию нельзя изменить здесь — она создана автоматически",
      "This transaction cannot be edited here — it was created automatically",
      "Không sửa được giao dịch tự động",
    ),
    ERP_FINANCE_SHIFT_CLOSED: T(
      "Закрытую кассовую смену сначала нужно править через показатели смены",
      "A closed cash shift is edited through the shift totals",
      "Ca đã đóng chỉ sửa được qua chỉ số ca",
    ),
    ERP_FINANCE_TRASH_EXPIRED: T(
      "Срок хранения в корзине истёк (30 дней).",
      "The 30-day trash period has expired.",
      "Hết hạn 30 ngày trong thùng rác.",
    ),
    ERP_SAME_ACCOUNT: T(
      "Для перевода укажите два разных счёта",
      "A transfer needs two different accounts",
      "Chuyển khoản cần hai tài khoản khác nhau",
    ),
    ERP_UNIT_LOCKED: T(
      "Единицу учёта нельзя изменить после первого использования",
      "The unit cannot change once the product is used",
      "Không thể đổi đơn vị khi đã sử dụng",
    ),
    ERP_DUPLICATE: T("Такая запись уже есть", "This already exists", "Đã tồn tại"),
    ERP_STALE: T("Данные изменил кто-то другой — обновите страницу", "Changed by someone else — reload the page", "Đã bị thay đổi, hãy tải lại"),
    ERP_COUNT_INCOMPLETE: T("Сначала заполните фактический остаток по всем позициям. Пустое поле — не ноль.", "Fill the actual quantity on every line first. An empty field is not zero.", "Hãy điền tồn thực tế mọi dòng. Ô trống không phải 0."),
    ERP_COUNT_OVERLAP: T("Эта позиция уже посчитана другой инвентаризацией за тот же период", "This item is already counted in another stock count for the same period", "Mặt hàng này đã được kiểm trong kỳ"),
    ERP_COUNT_STALE: T("Остатки изменились после открытия документа — обновите книжные количества", "Stock moved after this document was opened — refresh the book quantities", "Tồn đã đổi sau khi mở chứng từ — hãy làm mới"),
    ERP_COUNT_SUPERSEDED: T("Этот черновик заменён полной инвентаризацией", "This draft was replaced by a full stock count", "Bản nháp đã bị kiểm kê toàn bộ thay thế"),
    ERP_COUNT_HAS_DEPENDENTS: T("Сначала откройте более поздние инвентаризации", "Reopen later stock counts first", "Hãy mở lại các phiếu kiểm sau trước"),
    ERP_COUNT_UNKNOWN_COST: T("У излишка нет цены партии и нет справочной цены — укажите оценку, ноль подставлять нельзя", "This surplus has no lot price and no reference price — enter an estimate; do not use zero", "Hàng thừa chưa có giá — hãy nhập giá ước tính, không dùng 0"),
    ERP_INVALID: T("Проверьте заполнение полей", "Check the fields", "Kiểm tra lại thông tin"),
    ERP_PACK_UNIT: T(
      "Фасовка в другой единице — выберите совместимую",
      "This pack uses another unit — pick a compatible one",
      "Quy cách khác đơn vị — hãy chọn loại tương thích",
    ),
    ERP_NOT_FOUND: T("Не найдено", "Not found", "Không tìm thấy"),
    ERP_NOT_INSTALLED: T(
      "База ERP ещё не установлена",
      "The ERP database is not installed yet",
      "Cơ sở dữ liệu ERP chưa được cài đặt",
    ),
    ERP_NOT_CONFIGURED: T("На сервере не настроен доступ к базе", "Server database key is not set", "Chưa cấu hình khóa máy chủ"),
    network: T("Нет связи с сервером", "No connection", "Mất kết nối"),
    server: T("Ошибка сервера", "Server error", "Lỗi máy chủ"),
  };
  if (code === "ERP_STAFF_INCOMPLETE") {
    const fields: Record<string, string> = {
      category: T("категория", "category", "nhóm hàng"),
      supplier: T("поставщик", "supplier", "nhà cung cấp"),
      unit: T("единица заказа", "order unit", "đơn vị đặt"),
    };
    const missing = (detail ?? "").split(",").filter(Boolean).map((f) => fields[f] ?? f).join(", ");
    return `${T("Чтобы показать продукт в Staff, заполните", "To show the product in Staff, fill in", "Để hiện trong Staff, hãy điền")}: ${missing}`;
  }
  if (code === "ERP_DUPLICATE" && detail?.startsWith("item:")) {
    return T(
      "Этот код уже занят другим продуктом ERP — позиция не сохранена, чтобы не смешать разные товары",
      "This code belongs to another ERP product — not saved so different items are not mixed",
      "Mã này đã thuộc sản phẩm khác trong ERP",
    );
  }
  const text = texts[code] ?? code;
  return detail ? `${text}: ${detail}` : text;
}

export const vnd = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value).toLocaleString(locale())} ₫`;
export const pct = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `${(Math.round(value * 10) / 10).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const numText = (value: number) => (Math.round(value * 1000) / 1000).toLocaleString(locale(), { maximumFractionDigits: 3 });
export const qtyText = (value: number | null | undefined, unit?: string | null) => {
  if (value === null || value === undefined) return "—";
  if ((unit === "kg" || unit === "l") && value !== 0 && Math.abs(value) < 1) {
    return `${numText(value * 1000)} ${unitLabel(unit === "kg" ? "g" : "ml")}`;
  }
  return `${numText(value)}${unit ? ` ${unitLabel(unit)}` : ""}`;
};
/** Catalog name as stored. Do not invent box/bottle/pack types from the text. */
export const packText = (label: string) => label;

/** Poster-style unit on the packs list: «шт.» with a period in Russian. */
export const packUnitLabel = (unit: string | null | undefined) => {
  if (unit === "pcs") return T("шт.", "pcs", "cái");
  return unitLabel(unit);
};

/** Poster quantity: 3 decimals for kg/l (1 → 1,000), integers for pcs. */
export const packQtyText = (value: number, unit?: string | null) => {
  const rounded = Math.round(value * 1000) / 1000;
  if (unit === "pcs" && Number.isInteger(rounded)) return rounded.toLocaleString(locale());
  if (unit === "kg" || unit === "l") return rounded.toLocaleString(locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return numText(rounded);
};
export const dateText = (value: string | null | undefined) => {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
export const dateTimeText = (value: string | null | undefined) => (value ? `${dateText(value)} ${value.slice(11, 16)}` : "—");

export const num = (text: string): number | null => {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`erpField ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
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

/** g and ml are entered per 1000 so that 250 g becomes exactly 0.25 kg. */
const SUB_UNITS: Record<ErpUnit, { unit: string; divisor: number }[]> = {
  kg: [
    { unit: "kg", divisor: 1 },
    { unit: "g", divisor: 1000 },
  ],
  l: [
    { unit: "l", divisor: 1 },
    { unit: "ml", divisor: 1000 },
  ],
  pcs: [{ unit: "pcs", divisor: 1 }],
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
  if (!base) return <span className="erpNoUnit">{T("Сначала выберите единицу", "Choose a unit first", "Chọn đơn vị trước")}</span>;
  const divisor = options[unitIndex]?.divisor ?? 1;
  const shown = value === null || value === undefined ? null : Math.round(value * divisor * 1e6) / 1e6;
  return (
    <span className="erpQty">
      <NumberInput value={shown} disabled={disabled} onChange={(v) => onChange(v === null ? null : v / divisor)} />
      {options.length > 1 ? (
        <select value={unitIndex} disabled={disabled} onChange={(event) => setUnitIndex(Number(event.target.value))}>
          {options.map((option, index) => (
            <option key={option.unit} value={index}>
              {unitLabel(option.unit)}
            </option>
          ))}
        </select>
      ) : (
        <span className="erpUnit">{unitLabel(base)}</span>
      )}
    </span>
  );
}

export function productName(state: ErpState, id: string | null | undefined): string {
  const product = id ? state.products.find((p) => p.id === id) : undefined;
  return product ? productTitle(product) : "—";
}

export function warehouseName(state: ErpState, id: string | null | undefined): string {
  return (id && state.warehouses.find((w) => w.id === id)?.name) || "—";
}

/** Searchable product select (active products with a unit unless `allowAll`). */
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
      {!value || query ? (
        <input
          className="erpPickerSearch"
          type="search"
          value={query}
          disabled={disabled}
          placeholder={T("Найти продукт…", "Find a product…", "Tìm sản phẩm…")}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery("");
        }}
      >
        <option value="">
          {query && !options.length ? T("Ничего не найдено", "No matches", "Không tìm thấy") : T("— выберите —", "— choose —", "— chọn —")}
        </option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {productTitle(p)}
            {p.base_unit ? ` (${unitLabel(p.base_unit)})` : ""}
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
      <option value="">{T("— выберите склад —", "— choose location —", "— chọn kho —")}</option>
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

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

/* ---------- unsaved changes ---------- */

let dirtyForms = 0;

export const leaveText = () =>
  T("Есть несохранённые изменения. Уйти без сохранения?", "You have unsaved changes. Leave without saving?", "Có thay đổi chưa lưu. Rời đi?");

export const confirmLeave = () => dirtyForms === 0 || window.confirm(leaveText());

/** Warns before closing the tab or following an ERP link while `dirty`. */
export function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    dirtyForms += 1;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      dirtyForms -= 1;
      window.removeEventListener("beforeunload", handler);
    };
  }, [dirty]);
}

export function NavLink({
  href,
  className,
  children,
  onNavigate,
  onClick,
  ...rest
}: ComponentProps<typeof Link> & { onNavigate?: () => void }) {
  const publicHref = useErpHref(typeof href === "string" ? href : "");
  const mapped = typeof href === "string" ? publicHref : href;
  return (
    <Link
      href={mapped}
      className={className}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!confirmLeave()) event.preventDefault();
        else onNavigate?.();
      }}
    >
      {children}
    </Link>
  );
}

/* ---------- page building blocks ---------- */

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="erpPageHead">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="erpSub">{sub}</p> : null}
      </div>
      {actions ? <div className="erpPageActions">{actions}</div> : null}
    </div>
  );
}

export function SubTabs({ tabs, active }: { tabs: { href: string; label: string }[]; active: string }) {
  return (
    <nav className="erpSubTabs">
      {tabs.map((tab) => (
        <NavLink key={tab.href} href={tab.href} className={tab.href === active ? "active" : ""}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Empty list: says why it is empty and what to do next. */
export function Empty({
  title,
  text,
  action,
  kind = "empty",
}: {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  kind?: "empty" | "search" | "error";
}) {
  return (
    <div className={`erpEmptyState ${kind}`}>
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action ? <div className="erpActions center">{action}</div> : null}
    </div>
  );
}

export const noSearchResults = (reset: () => void) => (
  <Empty
    kind="search"
    title={T("Ничего не найдено", "No matches", "Không tìm thấy")}
    text={T("Измените запрос или сбросьте фильтры.", "Change the search or reset the filters.", "Đổi từ khóa hoặc bỏ bộ lọc.")}
    action={
      <button type="button" className="erpBtn" onClick={reset}>
        {T("Сбросить фильтры", "Reset filters", "Bỏ bộ lọc")}
      </button>
    }
  />
);

export function Tip({ children }: { children: ReactNode }) {
  return (
    <details className="erpTip">
      <summary aria-label={T("Подсказка", "Hint", "Gợi ý")}>?</summary>
      <div>{children}</div>
    </details>
  );
}

export const loadingText = () => T("Загрузка…", "Loading…", "Đang tải…");
export const savingText = () => T("Сохранение…", "Saving…", "Đang lưu…");
