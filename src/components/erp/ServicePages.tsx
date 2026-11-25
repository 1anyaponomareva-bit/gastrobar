"use client";

import { useEffect, useMemo, useState } from "react";
import { productTitle, type ErpUnit } from "@/lib/erp/costing";
import type { ErpChannel, ErpProduct, ErpRecipe, ErpRecipeLine, ErpSettings, ErpState, ErpTaxRate, StaffMergeResult } from "@/lib/erp/types";
import { DEFAULT_RECIPE_COST_SOURCE, RECIPE_COST_SOURCE_LABELS, type RecipeCostSourcePolicy } from "@/lib/erp/recipeCosting";
import {
  DEFAULT_VAT_RATE,
  VAT_ACCOUNTING_METHODS,
  catalogOrFallbackRates,
  defaultInputVatRate,
  defaultOutputVatRate,
  normalizeVatScope,
  taxRateLabel,
  vatRatesForSelect,
  visibleVatExceptions,
  type VatDirection,
  type VatExceptionScope,
} from "@/lib/erp/vat";
import { ChannelFinanceEditor } from "./ChannelFinanceEditor";
import { useErp } from "./ErpShell";
import { Pager, usePageSize } from "./Pager";
import { RefList } from "./RefList";
import { productsWithoutPack, productsWithoutUnit, unresolvedLines } from "./review";
import { errorText, Field, NavLink, PageHead, ProductPicker, QtyInput, savingText, SubTabs, T, toBase, unitLabel, unitOf, useDirtyGuard } from "./ui";

const serviceTabs = () => [
  { href: "/erp/service", label: T("Настройки", "Settings", "Cài đặt") },
  { href: "/erp/service/import", label: T("Загрузка данных", "Data import", "Nhập dữ liệu") },
  { href: "/erp/service/review", label: T("Проверка данных", "Data check", "Kiểm tra dữ liệu") },
];

function ServiceHead({ active }: { active: string }) {
  return (
    <>
      <PageHead
        title={T("Служебное", "Admin", "Quản trị")}
        sub={T("Настройки, загрузка данных из других приложений и проверка спорных записей.", "Settings, data import from other apps and checking unclear records.", "Cài đặt, nhập dữ liệu và kiểm tra.")}
      />
      <SubTabs tabs={serviceTabs()} active={active} />
    </>
  );
}

export function SettingsPage() {
  const { state, act, busy } = useErp();
  const [form, setForm] = useState<ErpSettings | null>(state?.settings ?? null);
  const [saved, setSaved] = useState(() => JSON.stringify(state?.settings ?? null));
  const dirty = Boolean(form) && JSON.stringify(form) !== saved;
  useDirtyGuard(dirty);
  if (!state || !form) return null;
  const set = <K extends keyof ErpSettings>(key: K, value: ErpSettings[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const taxRates = state.taxRates ?? [];

  return (
    <>
      <ServiceHead active="/erp/service" />

      <section className="erpCard" data-testid="tax-settings">
        <h2>{T("Налоги", "Taxes", "Thuế")}</h2>
        <div className="erpGrid two">
          <Field
            label={T("Метод налогового учёта", "VAT accounting method", "Phương pháp kế toán thuế GTGT")}
            hint={T(
              "Пусто — ещё не подтверждено администратором или бухгалтером.",
              "Empty means not yet confirmed by an administrator or accountant.",
              "Để trống = chưa được quản trị viên/kế toán xác nhận.",
            )}
          >
            <select
              className="erpVatSelect"
              value={form.vat_accounting_method ?? ""}
              onChange={(e) => set("vat_accounting_method", e.target.value || null)}
            >
              <option value="">{T("Не подтверждён", "Unconfirmed", "Chưa xác nhận")}</option>
              {VAT_ACCOUNTING_METHODS.filter((m) => m !== "unconfirmed").map((method) => (
                <option key={method} value={method}>
                  {method === "cash"
                    ? T("Кассовый", "Cash", "Tiền mặt")
                    : method === "accrual"
                      ? T("Начисление", "Accrual", "Dồn tích")
                      : T("Смешанный", "Hybrid", "Hỗn hợp")}
                </option>
              ))}
            </select>
          </Field>
          <label className="erpCheck">
            <input
              type="checkbox"
              checked={form.purchase_prices_include_vat_default ?? true}
              onChange={(e) => set("purchase_prices_include_vat_default", e.target.checked)}
            />
            {T("Закупочные цены по умолчанию включают НДС", "Purchase prices include VAT by default", "Giá mua mặc định đã gồm VAT")}
          </label>
          <label className="erpCheck">
            <input type="checkbox" checked={form.input_vat_enabled} onChange={(e) => set("input_vat_enabled", e.target.checked)} />
            {T("Учитывать входящий НДС в поставках", "Track input VAT on deliveries", "Tính VAT đầu vào khi nhập hàng")}
          </label>
          <Field
            label={T("Входящий НДС по умолчанию, %", "Default input VAT, %", "VAT đầu vào mặc định, %")}
            hint={T(
              "Новый ингредиент получает эту ставку. Без исключения — ставка компании (сейчас 8%).",
              "New ingredients get this rate. Everyone not on the exception list uses the company default (8% until changed).",
              "Nguyên liệu mới nhận mức này. Chưa có ngoại lệ thì dùng mức công ty (8% cho đến khi đổi).",
            )}
          >
            <VatRateSelect
              value={form.default_input_vat_rate}
              fallback={DEFAULT_VAT_RATE}
              taxRates={taxRates}
              onChange={(v) => set("default_input_vat_rate", v)}
            />
          </Field>
          <label className="erpCheck">
            <input type="checkbox" checked={form.output_vat_enabled} onChange={(e) => set("output_vat_enabled", e.target.checked)} />
            {T("Цены продажи включают НДС", "Sales prices include VAT", "Giá bán đã gồm VAT")}
          </label>
          <Field label={T("Исходящий НДС по умолчанию, %", "Default output VAT, %", "VAT đầu ra mặc định, %")}>
            <VatRateSelect
              value={form.default_output_vat_rate}
              fallback={DEFAULT_VAT_RATE}
              taxRates={taxRates}
              onChange={(v) => set("default_output_vat_rate", v)}
            />
          </Field>
          <Field
            label={T("Источник себестоимости техкарт", "Tech-card cost source", "Nguồn giá vốn công thức")}
            hint={T(
              "Прогноз для меню. Фактическое списание сырья — только FIFO. Отсутствие цены ≠ 0.",
              "Forecast for menu cards. Actual ingredient write-off stays FIFO. Missing price is never zero.",
              "Dự báo cho thẻ món. Xuất nguyên liệu thực tế vẫn FIFO. Thiếu giá không thành 0.",
            )}
          >
            <select
              className="erpVatSelect"
              data-testid="recipe-cost-source"
              value={form.recipe_cost_source ?? DEFAULT_RECIPE_COST_SOURCE}
              onChange={(e) => set("recipe_cost_source", (e.target.value || DEFAULT_RECIPE_COST_SOURCE) as RecipeCostSourcePolicy)}
            >
              {(Object.keys(RECIPE_COST_SOURCE_LABELS) as RecipeCostSourcePolicy[]).map((key) => (
                <option key={key} value={key}>
                  {RECIPE_COST_SOURCE_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="erpHint">
          {T(
            "«Цены продажи включают НДС» — это Sales Prices Include VAT (поле output_vat_enabled). Входящий НДС включён — себестоимость без возмещаемого НДС. Изменение настроек не пересчитывает уже проведённые документы.",
            "“Sales prices include VAT” is the Sales Prices Include VAT flag (output_vat_enabled). With input VAT on, cost excludes recoverable VAT. Changing settings never recalculates posted documents.",
            "“Giá bán đã gồm VAT” là Sales Prices Include VAT (output_vat_enabled). Bật VAT đầu vào: giá vốn không gồm VAT được khấu trừ. Chứng từ đã ghi sổ không bị tính lại.",
          )}
        </p>
        <div className="erpActions end">
          <button
            type="button"
            className="erpBtn primary"
            disabled={busy || !dirty}
            onClick={async () => {
              const settings = {
                ...form,
                default_input_vat_rate: form.default_input_vat_rate ?? DEFAULT_VAT_RATE,
                default_output_vat_rate: form.default_output_vat_rate ?? DEFAULT_VAT_RATE,
                purchase_prices_include_vat_default: form.purchase_prices_include_vat_default ?? true,
                vat_accounting_method: form.vat_accounting_method || null,
                recipe_cost_source: form.recipe_cost_source ?? DEFAULT_RECIPE_COST_SOURCE,
              };
              if (await act({ action: "saveSettings", settings }, T("Настройки сохранены", "Settings saved", "Đã lưu cài đặt"))) {
                setForm(settings);
                setSaved(JSON.stringify(settings));
              }
            }}
          >
            {busy ? savingText() : T("Сохранить настройки", "Save settings", "Lưu cài đặt")}
          </button>
        </div>
      </section>

      <TaxRatesCard />

      <VatExceptionsCard
        direction="input"
        defaultRate={defaultInputVatRate(state.settings)}
        testId="vat-exceptions-input"
      />
      <VatExceptionsCard
        direction="output"
        defaultRate={defaultOutputVatRate(state.settings)}
        testId="vat-exceptions-output"
      />

      <section className="erpCard">
        <h2>{T("Каналы продаж", "Sales channels", "Kênh bán")}</h2>
        <p className="erpHint">
          {T(
            "Финансовые настройки канала: НДС продажи, комиссия, реклама, цели маржи. Карточка блюда (Phase 7) использует financialCalculator; Legacy Rate — только fallback.",
            "Channel finance: sales VAT, commission, advertising, margin targets. Dish card (Phase 7) uses financialCalculator; Legacy Rate is fallback only.",
            "Thẻ món (Phase 7) dùng financialCalculator; Legacy Rate chỉ là fallback.",
          )}
        </p>
        <ChannelFinanceEditor channels={state.channels} />
        <h3>{T("Добавить / переименовать канал", "Add / rename channel", "Thêm / đổi tên kênh")}</h3>
        <RefList<ErpChannel>
          entity="channel"
          rows={state.channels}
          columns={[
            { key: "name", label: T("Канал", "Channel", "Kênh") },
            {
              key: "commission_pct",
              label: T("Legacy комиссия, %", "Legacy commission, %", "Hoa hồng legacy, %"),
              kind: "number",
            },
          ]}
          addLabel={T("Добавить канал", "Add channel", "Thêm kênh")}
          emptyTitle={T("Каналов продаж пока нет", "No sales channels yet", "Chưa có kênh bán")}
          emptyText={T("Например: в заведении, Grab Food, Shopee Food.", "For example: dine-in, Grab Food, Shopee Food.", "Ví dụ: tại quán, Grab Food, Shopee Food.")}
        />
      </section>

      <SpeedCard />
    </>
  );
}

function VatRateSelect({
  value,
  onChange,
  fallback,
  exclude,
  disabled,
  taxRates,
}: {
  value: number | null | undefined;
  onChange: (value: number) => void;
  fallback?: number;
  exclude?: number | null;
  disabled?: boolean;
  taxRates?: ErpTaxRate[] | null;
}) {
  const shown = value ?? fallback ?? DEFAULT_VAT_RATE;
  return (
    <select
      className="erpVatSelect"
      value={String(shown)}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {vatRatesForSelect(shown, exclude, taxRates).map((rate) => (
        <option key={rate} value={rate}>
          {rate}%
        </option>
      ))}
    </select>
  );
}

function treatmentLabel(treatment: string) {
  if (treatment === "exempt") return T("Освобождение", "Exempt", "Miễn thuế");
  if (treatment === "not_subject") return T("Не подлежит декларации", "Not subject", "Không kê khai");
  return T("Стандарт", "Standard", "Chuẩn");
}

function TaxRatesCard() {
  const { state, act, busy } = useErp();
  const rows = catalogOrFallbackRates(state?.taxRates);
  const [editId, setEditId] = useState<string | null>(null);
  const editing = rows.find((row) => row.id === editId) ?? null;
  const [name, setName] = useState("");
  const [nameVn, setNameVn] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setNameVn(editing.name_vn ?? "");
    setEffectiveFrom((editing.effective_from ?? "").slice(0, 10));
    setEffectiveTo((editing.effective_to ?? "").slice(0, 10));
    setActive(editing.is_active !== false);
  }, [editing]);
  if (!state) return null;
  const catalogReady = (state.taxRates?.length ?? 0) > 0;
  const save = async () => {
    if (!editing || editing.id.startsWith("fallback-")) return;
    if (
      await act(
        {
          action: "saveTaxRate",
          taxRate: {
            id: editing.id,
            name,
            name_vn: nameVn,
            rate: editing.rate,
            tax_treatment: editing.tax_treatment,
            effective_from: effectiveFrom || null,
            effective_to: effectiveTo || null,
            is_active: active,
            sort: editing.sort ?? 0,
          },
        },
        T("Ставка сохранена", "Tax rate saved", "Đã lưu thuế suất"),
      )
    ) {
      setEditId(null);
    }
  };
  return (
    <section className="erpCard" data-testid="tax-rates">
      <h2>{T("Справочник налоговых ставок", "Tax rates catalog", "Danh mục thuế suất")}</h2>
      <p className="erpHint">
        {T(
          "0%, освобождение от НДС и «не подлежит декларированию» — разные записи. История изменений пишется в журнал; проведённые документы не пересчитываются.",
          "0%, VAT Exempt, and Not Subject To VAT Declaration are separate rows. Changes are written to history; posted documents are never recalculated.",
          "0%, miễn thuế GTGT và không kê khai là các dòng riêng. Mọi thay đổi được ghi lịch sử; chứng từ đã ghi sổ không bị tính lại.",
        )}
      </p>
      {!catalogReady ? (
        <p className="erpHint">
          {T(
            "Каталог ещё не загружен из базы — показан запасной список 0/5/8/10%. После применения миграции появятся Exempt и Not Subject.",
            "Catalog not loaded from the database yet — showing fallback 0/5/8/10%. After the migration, Exempt and Not Subject appear.",
            "Chưa tải danh mục từ CSDL — đang dùng dự phòng 0/5/8/10%. Sau migration sẽ có Exempt và Not Subject.",
          )}
        </p>
      ) : null}
      <div className="erpTableWrap">
        <table className="erpTable stack">
          <thead>
            <tr>
              <th>{T("Код", "Code", "Mã")}</th>
              <th>{T("Название", "Name", "Tên")}</th>
              <th className="num">{T("Ставка, %", "Rate, %", "Thuế suất, %")}</th>
              <th>{T("Режим", "Treatment", "Cách xử lý")}</th>
              <th>{T("С", "From", "Từ")}</th>
              <th>{T("По", "To", "Đến")}</th>
              <th>{T("Активна", "Active", "Hiệu lực")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.code}</code>
                </td>
                <td>{taxRateLabel(row)}</td>
                <td className="num">{asVatDisplay(row.rate)}</td>
                <td>{treatmentLabel(String(row.tax_treatment))}</td>
                <td>{(row.effective_from ?? "").slice(0, 10) || "—"}</td>
                <td>{(row.effective_to ?? "").slice(0, 10) || "—"}</td>
                <td>{row.is_active === false ? T("Нет", "No", "Không") : T("Да", "Yes", "Có")}</td>
                <td>
                  {catalogReady && !row.id.startsWith("fallback-") ? (
                    <button type="button" className="erpBtn" disabled={busy} onClick={() => setEditId(row.id)}>
                      {T("Изменить", "Edit", "Sửa")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && !editing.id.startsWith("fallback-") ? (
        <div className="erpGrid two" style={{ marginTop: 12 }}>
          <Field label={T("Название (EN)", "Name (EN)", "Tên (EN)")}>
            <input className="erpInput" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={T("Название (VN)", "Name (VN)", "Tên (VN)")}>
            <input className="erpInput" value={nameVn} onChange={(e) => setNameVn(e.target.value)} />
          </Field>
          <Field label={T("Действует с", "Effective from", "Hiệu lực từ")}>
            <input className="erpInput" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label={T("Действует по", "Effective to", "Hiệu lực đến")}>
            <input className="erpInput" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </Field>
          <label className="erpCheck">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {T("Активна", "Active", "Hiệu lực")}
          </label>
          <div className="erpActions end">
            <button type="button" className="erpBtn" disabled={busy} onClick={() => setEditId(null)}>
              {T("Отмена", "Cancel", "Huỷ")}
            </button>
            <button type="button" className="erpBtn primary" disabled={busy || !name.trim()} onClick={() => void save()}>
              {busy ? savingText() : T("Сохранить ставку", "Save rate", "Lưu thuế suất")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function asVatDisplay(rate: number) {
  return Number.isInteger(rate) ? String(rate) : String(rate);
}

function VatExceptionsCard({
  direction,
  defaultRate,
  testId,
}: {
  direction: VatDirection;
  defaultRate: number;
  testId: string;
}) {
  const { state, act, busy } = useErp();
  const taxRates = state?.taxRates;
  const listed = visibleVatExceptions(state?.vatExceptions, defaultRate, direction);
  const otherRates = useMemo(() => vatRatesForSelect(null, defaultRate, taxRates), [defaultRate, taxRates]);
  const scopes: VatExceptionScope[] =
    direction === "input" ? ["product", "category"] : ["dish", "product", "category"];
  const [scope, setScope] = useState<VatExceptionScope>(scopes[0]);
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dishId, setDishId] = useState("");
  const [rate, setRate] = useState(() => vatRatesForSelect(null, defaultRate, taxRates)[0] ?? 10);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePageSize();
  useEffect(() => {
    if (!scopes.includes(scope)) setScope(scopes[0]);
  }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rate === defaultRate && otherRates[0] != null) setRate(otherRates[0]);
  }, [defaultRate, otherRates, rate]);
  useEffect(() => setPage(0), [listed.length, pageSize]);
  if (!state) return null;

  const usedProductIds = new Set(
    listed.filter((r) => normalizeVatScope(r) === "product" && r.product_id).map((r) => r.product_id as string),
  );
  const usedCategoryIds = new Set(
    listed.filter((r) => normalizeVatScope(r) === "category" && r.category_id).map((r) => r.category_id as string),
  );
  const usedDishIds = new Set(
    listed.filter((r) => normalizeVatScope(r) === "dish" && r.dish_id).map((r) => r.dish_id as string),
  );
  const pickerState: ErpState = {
    ...state,
    products: state.products.filter((p) => !usedProductIds.has(p.id)),
  };
  const title =
    direction === "input"
      ? T("Исключения входящего НДС", "Input VAT exceptions", "Ngoại lệ VAT đầu vào")
      : T("Исключения исходящего НДС", "Output VAT exceptions", "Ngoại lệ VAT đầu ra");
  const hint =
    direction === "input"
      ? T(
          `Входящий НДС: приоритет позиция → категория → ${defaultRate}% по умолчанию. Ингредиенты, упаковка, закупки. Не пересчитывает проведённые документы.`,
          `Input VAT: item → category → ${defaultRate}% default. Ingredients, packaging, purchases. Never recalculates posted documents.`,
          `VAT đầu vào: mặt hàng → danh mục → mặc định ${defaultRate}%. Không tính lại chứng từ đã ghi sổ.`,
        )
      : T(
          `Исходящий НДС: приоритет блюдо/товар → категория меню → ${defaultRate}% по умолчанию. Независимо от входящего. Не пересчитывает проведённые документы.`,
          `Output VAT: dish/product → menu category → ${defaultRate}% default. Independent of input. Never recalculates posted documents.`,
          `VAT đầu ra: món/hàng → danh mục → mặc định ${defaultRate}%. Độc lập với đầu vào. Không tính lại chứng từ đã ghi sổ.`,
        );

  const named = listed
    .map((row) => {
      const sc = normalizeVatScope(row);
      let name = "—";
      if (sc === "product" && row.product_id) {
        name = productTitle(state.products.find((p) => p.id === row.product_id) ?? { name_en: row.product_id, name_vn: "" });
      } else if (sc === "category" && row.category_id) {
        const cat = state.categories.find((c) => c.id === row.category_id);
        name = cat ? cat.name_en || cat.name_vn || cat.code : row.category_id;
      } else if (sc === "dish" && row.dish_id) {
        const dish = state.dishes.find((d) => d.id === row.dish_id);
        name = dish ? dish.name_en || dish.name_vn || dish.code : row.dish_id;
      }
      return { ...row, scope: sc, name };
    })
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(named.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = named.slice(current * pageSize, current * pageSize + pageSize);

  const canAdd =
    rate !== defaultRate &&
    ((scope === "product" && Boolean(productId)) ||
      (scope === "category" && Boolean(categoryId)) ||
      (scope === "dish" && Boolean(dishId)));

  const add = async () => {
    if (!canAdd) return;
    const exception = {
      direction,
      vat_direction: direction,
      scope_kind: scope,
      scope,
      product_id: scope === "product" ? productId : null,
      category_id: scope === "category" ? categoryId : null,
      dish_id: scope === "dish" ? dishId : null,
      vat_rate: rate,
    };
    if (await act({ action: "saveVatException", exception }, T("Исключение сохранено", "Exception saved", "Đã lưu ngoại lệ"))) {
      setProductId("");
      setCategoryId("");
      setDishId("");
    }
  };

  const scopeLabel = (sc: VatExceptionScope) =>
    sc === "product"
      ? T("Позиция", "Item", "Mặt hàng")
      : sc === "category"
        ? T("Категория", "Category", "Danh mục")
        : T("Блюдо", "Dish", "Món");

  return (
    <section className="erpCard erpVatExceptions" data-testid={testId}>
      <h2>{title}</h2>
      <p className="erpHint">{hint}</p>
      <div className="erpVatAdd">
        <Field label={T("Область", "Scope", "Phạm vi")}>
          <select className="erpVatSelect" value={scope} onChange={(e) => setScope(e.target.value as VatExceptionScope)}>
            {scopes.map((sc) => (
              <option key={sc} value={sc}>
                {scopeLabel(sc)}
              </option>
            ))}
          </select>
        </Field>
        {scope === "product" ? (
          <Field label={T("Позиция", "Item", "Mặt hàng")} wide>
            <ProductPicker state={pickerState} value={productId} onChange={setProductId} />
          </Field>
        ) : null}
        {scope === "category" ? (
          <Field label={T("Категория", "Category", "Danh mục")} wide>
            <select className="erpVatSelect" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{T("Выберите…", "Select…", "Chọn…")}</option>
              {state.categories
                .filter((c) => !c.archived_at && !c.deleted_at && !usedCategoryIds.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en || c.name_vn || c.code}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        {scope === "dish" ? (
          <Field label={T("Блюдо", "Dish", "Món")} wide>
            <select className="erpVatSelect" value={dishId} onChange={(e) => setDishId(e.target.value)}>
              <option value="">{T("Выберите…", "Select…", "Chọn…")}</option>
              {state.dishes
                .filter((d) => !d.archived_at && !usedDishIds.has(d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_en || d.name_vn || d.code}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <Field label={T("НДС, %", "VAT, %", "VAT, %")}>
          <VatRateSelect value={rate} exclude={defaultRate} taxRates={taxRates} onChange={setRate} />
        </Field>
        <div className="erpVatAddAct">
          <button type="button" className="erpBtn primary" disabled={busy || !canAdd} onClick={() => void add()}>
            {T("Добавить", "Add", "Thêm")}
          </button>
        </div>
      </div>
      {named.length ? (
        <>
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <thead>
                <tr>
                  <th>{T("Область", "Scope", "Phạm vi")}</th>
                  <th>{T("Цель", "Target", "Đối tượng")}</th>
                  <th className="num">{T("НДС", "VAT", "VAT")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id ?? `${row.scope}-${row.product_id ?? row.category_id ?? row.dish_id}`}>
                    <td>{scopeLabel(row.scope)}</td>
                    <td className="main">
                      <span className="erpName">{row.name}</span>
                    </td>
                    <td className="num" data-label={T("НДС", "VAT", "VAT")}>
                      {row.vat_rate}%
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="erpBtn ghost erpVatRemove"
                        disabled={busy}
                        aria-label={T("Убрать", "Remove", "Xóa")}
                        onClick={() =>
                          void act(
                            row.id
                              ? { action: "deleteVatException", id: row.id }
                              : { action: "deleteVatException", productId: row.product_id ?? undefined },
                            T("Исключение удалено", "Exception removed", "Đã xóa ngoại lệ"),
                          )
                        }
                      >
                        {T("Убрать", "Remove", "Xóa")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={named.length} page={current} pages={pages} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
        </>
      ) : (
        <p className="erpHint">
          {T("Исключений пока нет — действует ставка по умолчанию для этого направления.", "No exceptions yet — the default rate for this direction applies.", "Chưa có ngoại lệ — dùng mức mặc định của chiều này.")}
        </p>
      )}
    </section>
  );
}

type Ping = { region: string | null; authMs: number; dbMs: number[]; totalMs: number };
const ms = () => T("мс", "ms", "ms");

/** Shows where the time of one ERP request goes, to tell network distance from slow screens. */
function SpeedCard() {
  const [result, setResult] = useState<Ping | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setFailed(null);
    try {
      const runs: Ping[] = [];
      for (let i = 0; i < 3; i += 1) {
        const start = performance.now();
        const response = await fetch("/api/erp/ping", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "server");
        runs.push({ ...(data as Omit<Ping, "totalMs">), totalMs: Math.round(performance.now() - start) });
      }
      // The fastest run: the first may include a server start-up.
      setResult(runs.reduce((best, run) => (run.totalMs < best.totalMs ? run : best)));
    } catch (e) {
      setFailed(errorText(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "network"));
    } finally {
      setRunning(false);
    }
  };

  const db = result ? Math.min(...result.dbMs) : 0;
  return (
    <section className="erpCard">
      <h2>{T("Скорость связи", "Connection speed", "Tốc độ kết nối")}</h2>
      <p className="erpHint">
        {T(
          "Каждое действие — запрос к серверу, который обращается к базе данных. Если база отвечает дольше 50 мс, сервер и база, скорее всего, в разных регионах.",
          "Every action is a request to the server, which queries the database. If the database takes over 50 ms, the server and the database are probably in different regions.",
          "Mỗi thao tác là một yêu cầu tới máy chủ, máy chủ truy vấn cơ sở dữ liệu. Nếu CSDL phản hồi quá 50 ms, có lẽ máy chủ và CSDL ở khác khu vực.",
        )}
      </p>
      {result ? (
        <dl className="erpFacts">
          <dt>{T("Регион сервера", "Server region", "Khu vực máy chủ")}</dt>
          <dd>{result.region ?? T("локальный", "local", "cục bộ")}</dd>
          <dt>{T("Проверочный запрос (3 обращения к базе)", "Test request (3 database queries)", "Yêu cầu thử (3 truy vấn CSDL)")}</dt>
          <dd>{result.totalMs} {ms()}</dd>
          <dt>{T("Проверка входа", "Sign-in check", "Kiểm tra đăng nhập")}</dt>
          <dd>{result.authMs} {ms()}</dd>
          <dt>{T("Один запрос к базе", "One database query", "Một truy vấn CSDL")}</dt>
          <dd>
            {db} {ms()} {db > 50 ? <span className="erpBadge warn">{T("далеко", "far", "xa")}</span> : null}
          </dd>
        </dl>
      ) : null}
      {failed ? <div className="erpNotice bad">{failed}</div> : null}
      <div className="erpActions end">
        <button type="button" className="erpBtn" disabled={running} onClick={run}>
          {running ? T("Проверяем…", "Checking…", "Đang kiểm tra…") : T("Проверить скорость", "Check speed", "Kiểm tra tốc độ")}
        </button>
      </div>
    </section>
  );
}


const FIELD_NAMES = (): Record<string, string> => ({
  name: T("Название", "Name", "Tên"),
  nameVn: T("Название VN", "Name VN", "Tên VN"),
  brand: T("Бренд", "Brand", "Thương hiệu"),
  category: T("Категория", "Category", "Nhóm"),
  supplier: T("Поставщик", "Supplier", "Nhà cung cấp"),
  unit: T("Единица заказа", "Order unit", "Đơn vị đặt"),
  pack: T("Фасовка", "Pack", "Quy cách"),
  itemNo: T("Артикул", "Item no.", "Mã hàng"),
  hidden: T("Скрыт в заявках", "Hidden in orders", "Ẩn"),
  listed: T("Показан в Staff", "Listed in Staff", "Hiện trong Staff"),
});

/**
 * Staff and the ERP share one catalog. This card compares the old Staff file with the ERP and
 * adds only what the ERP is missing; it never changes existing ERP rows.
 */
export function StaffImportCard({ compact }: { compact?: boolean }) {
  const { state, act, busy } = useErp();
  const [result, setResult] = useState<StaffMergeResult | null>(null);
  if (!state) return null;
  const noUnit = productsWithoutUnit(state).length;
  const run = async (apply: boolean) => {
    if (apply && !window.confirm(T("Добавить в ERP записи, которых в нём нет? Существующие записи не изменятся.", "Add the records the ERP is missing? Existing records will not change.", "Thêm các bản ghi còn thiếu?"))) return;
    const data = await act<StaffMergeResult>({ action: "staffCatalogMerge", apply }, apply ? T("Недостающие записи перенесены", "Missing records added", "Đã thêm") : false);
    if (data) setResult(data);
  };
  const plan = result?.plan;
  const toAdd = plan ? plan.add.items.length + plan.add.suppliers.length + plan.add.categories.length : 0;
  const names = FIELD_NAMES();
  const list = (items: string[]) =>
    items.length > 30 ? `${items.slice(0, 30).join(", ")} ${T("и ещё", "and", "và")} ${items.length - 30}` : items.join(", ");

  return (
    <section className="erpCard" data-testid="staff-catalog-card">
      <h2>{T("Справочник Staff", "Staff catalog", "Danh mục Staff")}</h2>
      <p className="erpHint">
        {T(
          "Товары, поставщики и категории приложения заказов Staff и ERP — один справочник. Сверка сравнивает старый файл Staff с ERP; перенос добавляет только недостающие записи и ничего не меняет в существующих. Остатки и складские документы при этом не создаются.",
          "The Staff ordering app and the ERP share one catalog. The check compares the old Staff file with the ERP; the transfer only adds missing records and changes nothing that exists. No stock or documents are created.",
          "Staff và ERP dùng chung danh mục. Đối chiếu so sánh tệp Staff cũ với ERP; chỉ thêm bản ghi còn thiếu.",
        )}
      </p>
      <div className="erpActions">
        <button type="button" className="erpBtn" disabled={busy} onClick={() => run(false)}>
          {T("Сверить со Staff", "Compare with Staff", "Đối chiếu với Staff")}
        </button>
        {plan && toAdd ? (
          <button type="button" className="erpBtn primary" disabled={busy} onClick={() => run(true)}>
            {T(`Перенести недостающие (${toAdd})`, `Add missing (${toAdd})`, `Thêm còn thiếu (${toAdd})`)}
          </button>
        ) : null}
      </div>
      {result && plan ? (
        <div className="erpMergeReport" data-testid="staff-merge-report">
          <p>
            {T("Staff сейчас работает с", "Staff currently uses", "Staff đang dùng")}{" "}
            <b>
              {result.source === "erp"
                ? T("общим справочником ERP", "the shared ERP catalog", "danh mục chung ERP")
                : T("старым файлом Staff (ERP видит его только после переноса)", "the old Staff file (the ERP sees it only after a transfer)", "tệp Staff cũ")}
            </b>
            {!result.fileFound ? ` · ${T("файл Staff не найден — сравнивается начальный каталог", "no Staff file — the starting catalog is compared", "không có tệp Staff")}` : ""}
          </p>
          {result.applied ? (
            <div className="erpNotice ok">
              {T("Добавлено", "Added", "Đã thêm")}: {T("товаров", "items", "mặt hàng")} {result.applied.items ?? 0}, {T("поставщиков", "suppliers", "nhà cung cấp")} {result.applied.suppliers ?? 0},{" "}
              {T("категорий", "categories", "nhóm")} {result.applied.categories ?? 0}
            </div>
          ) : null}
          <ul className="erpMergeSummary">
            <li>{T("Совпадают", "Identical", "Trùng khớp")}: {plan.same}</li>
            <li>{T("Можно добавить", "Can be added", "Có thể thêm")}: {toAdd}</li>
            <li>{T("Отличаются (оставлено значение ERP)", "Different (ERP value kept)", "Khác nhau")}: {plan.differs.length}</li>
            <li>{T("На ручную проверку", "Manual check", "Cần kiểm tra")}: {plan.ambiguous.length + plan.archivedRefs.length}</li>
            <li>{T("Есть только в ERP", "Only in the ERP", "Chỉ có trong ERP")}: {plan.onlyInErp.length}</li>
          </ul>
          {toAdd ? (
            <>
              <h3>{T("Можно добавить", "Can be added", "Có thể thêm")}</h3>
              {plan.add.items.length ? <p>{T("Товары", "Items", "Mặt hàng")}: {list(plan.add.items.map((i) => (i.brand ? `${i.name} · ${i.brand}` : i.name)))}</p> : null}
              {plan.add.suppliers.length ? <p>{T("Поставщики", "Suppliers", "Nhà cung cấp")}: {list(plan.add.suppliers.map((s) => s.label))}</p> : null}
              {plan.add.categories.length ? <p>{T("Категории", "Categories", "Nhóm")}: {list(plan.add.categories.map((c) => c.en))}</p> : null}
            </>
          ) : null}
          {plan.needsSetup.length ? (
            <div className="erpNotice warn">
              {T(
                "У этих новых товаров фасовка не указывает единицу — они будут добавлены без единицы учёта. Заказы в Staff работают; для поставок и остатков выберите единицу в карточке продукта:",
                "These new items have no unit in their pack — they are added without a stock unit. Staff orders work; choose a unit in the product card before stock operations:",
                "Các mặt hàng này chưa có đơn vị — chọn đơn vị trước khi nhập kho:",
              )}{" "}
              {list(plan.needsSetup.map((i) => `${i.name}${i.pack ? ` (${i.pack})` : ""}`))}
            </div>
          ) : null}
          {plan.ambiguous.length ? (
            <>
              <h3>{T("На ручную проверку — не перенесены", "Manual check — not added", "Cần kiểm tra — chưa thêm")}</h3>
              <div className="erpScrollX">
                <table className="erpTable">
                  <thead>
                    <tr>
                      <th>{T("В Staff", "In Staff", "Trong Staff")}</th>
                      <th>{T("Похожие в ERP", "Similar in the ERP", "Tương tự trong ERP")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.ambiguous.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.name}
                          {a.brand ? ` · ${a.brand}` : ""} <small className="erpCellSub">{a.id}</small>
                        </td>
                        <td>{a.candidates.map((c) => `${c.name}${c.brand ? ` · ${c.brand}` : ""} (${c.code})`).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {plan.archivedRefs.length ? (
            <p className="erpNotice warn">
              {T("В ERP в архиве, а в Staff используются", "Archived in the ERP but used in Staff", "Đã lưu trữ trong ERP nhưng Staff dùng")}: {list(plan.archivedRefs.map((r) => `${r.name} (${r.id})`))}
            </p>
          ) : null}
          {plan.differs.length ? (
            <details>
              <summary>
                {T("Отличаются", "Different", "Khác nhau")}: {plan.differs.length} — {T("значения ERP сохранены", "ERP values kept", "giữ giá trị ERP")}
              </summary>
              <div className="erpScrollX">
                <table className="erpTable">
                  <thead>
                    <tr>
                      <th>{T("Позиция", "Item", "Mặt hàng")}</th>
                      <th>{T("Поле", "Field", "Trường")}</th>
                      <th>Staff</th>
                      <th>ERP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.differs.flatMap((d) =>
                      d.fields.map((f) => (
                        <tr key={`${d.id}-${f.field}`}>
                          <td>{d.name}</td>
                          <td>{names[f.field] ?? f.field}</td>
                          <td>{f.staff || "—"}</td>
                          <td>{f.erp || "—"}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          {plan.onlyInErp.length ? (
            <p className="erpHint">
              {T("Есть только в ERP (например, созданы в ERP)", "Only in the ERP (for example created there)", "Chỉ có trong ERP")}: {list(plan.onlyInErp.map((p) => (p.brand ? `${p.name} · ${p.brand}` : p.name)))}
            </p>
          ) : null}
          {noUnit ? (
            <p>
              <NavLink href="/erp/service/review" className="erpLink">
                {T(`Выберите единицу учёта для ${noUnit} продуктов`, `Choose a unit for ${noUnit} products`, `Chọn đơn vị cho ${noUnit} sản phẩm`)}
              </NavLink>
            </p>
          ) : compact ? (
            <NavLink href="/erp/menu/ingredients" className="erpLink">
              {T("Открыть каталог ингредиентов", "Open the ingredients catalog", "Mở danh mục nguyên liệu")}
            </NavLink>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RecipesImportCard() {
  return (
    <section className="erpCard">
      <h2>{T("Рецептуры полуфабрикатов", "Semi-finished recipes", "Công thức bán thành phẩm")}</h2>
      <p className="erpHint">
        {T(
          "То, что уже есть в приложении Recipes, в ERP не загружается. Карточка, которую вы сохраняете в полуфабрикатах, сама появляется в Recipes для сотрудников.",
          "Recipes already in the staff app are not imported into ERP. A prep you save in ERP is published to Recipes for staff.",
          "Công thức đã có trên Recipes không được nhập vào ERP. Thẻ bạn lưu trong bán thành phẩm sẽ hiện trên Recipes cho nhân viên.",
        )}
      </p>
    </section>
  );
}

export function ImportPage() {
  return (
    <>
      <ServiceHead active="/erp/service/import" />
      <StaffImportCard />
      <RecipesImportCard />
    </>
  );
}

export function ReviewPage() {
  const { state } = useErp();
  if (!state) return null;
  const lines = unresolvedLines(state);
  const noUnit = productsWithoutUnit(state);
  const noPack = productsWithoutPack(state);
  const allGood = !lines.length && !noUnit.length && !noPack.length;

  return (
    <>
      <ServiceHead active="/erp/service/review" />
      <p className="erpHint">
        {T(
          "Здесь только то, что не удалось сопоставить наверняка после загрузки. Ничего не угадывается автоматически.",
          "Only what could not be matched for sure after import. Nothing is guessed automatically.",
          "Chỉ những mục không thể khớp chắc chắn. Không tự đoán.",
        )}
      </p>
      {allGood ? <div className="erpNotice ok">{T("Всё в порядке — уточнять нечего.", "All good — nothing to check.", "Mọi thứ đều ổn.")}</div> : null}

      {noUnit.length ? (
        <section className="erpCard">
          <h2>
            {T("Выберите единицу учёта", "Choose a stock unit", "Chọn đơn vị")} ({noUnit.length})
          </h2>
          <p className="erpHint">{T("Без единицы продукт нельзя принять на склад или добавить в рецептуру.", "Without a unit the product cannot be received or used in a recipe.", "Không có đơn vị thì không thể nhập kho hay dùng trong công thức.")}</p>
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <thead>
                <tr>
                  <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                  <th>{T("Как заказывают в Staff", "How it is ordered in Staff", "Cách đặt trong Staff")}</th>
                  <th>{T("Единица", "Unit", "Đơn vị")}</th>
                </tr>
              </thead>
              <tbody>
                {noUnit.map((product) => (
                  <UnitRow key={product.id} product={product} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {lines.length ? (
        <section className="erpCard">
          <h2>
            {T("Сопоставьте ингредиенты рецептур", "Link recipe ingredients", "Liên kết nguyên liệu công thức")} ({lines.length})
          </h2>
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <thead>
                <tr>
                  <th>{T("Как написано в рецептуре", "Text in the recipe", "Tên trong công thức")}</th>
                  <th>{T("Продукт из каталога", "Catalog product", "Sản phẩm trong danh mục")}</th>
                  <th>{T("Количество", "Quantity", "Số lượng")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map(({ recipe, line }) => (
                  <ResolveRow key={line.id} state={state} recipe={recipe} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {noPack.length ? (
        <section className="erpCard">
          <h2>
            {T("Уточните размер упаковки", "Set the pack size", "Nhập quy cách")} ({noPack.length})
          </h2>
          <p className="erpHint">{T("Когда размер известен (например, коробка = 13,5 кг), добавьте его в карточке продукта. Это необязательно.", "When the size is known (e.g. box = 13.5 kg), add it on the product card. Optional.", "Khi biết quy cách, thêm vào thẻ sản phẩm. Không bắt buộc.")}</p>
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <tbody>
                {noPack.map((product) => (
                  <tr key={product.id}>
                    <td className="main">
                      <span className="erpName">{productTitle(product)}</span>
                      <span className="erpCellSub">
                        Staff: {product.staff_unit ?? "—"} · {product.staff_pack ?? "—"}
                      </span>
                    </td>
                    <td className="num">
                      <NavLink href={`/erp/products/${product.id}`} className="erpBtn small">
                        {T("Открыть продукт", "Open product", "Mở sản phẩm")}
                      </NavLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function ResolveRow({ state, recipe, line }: { state: ErpState; recipe: ErpRecipe; line: ErpRecipeLine }) {
  const { act, busy } = useErp();
  const [productId, setProductId] = useState<string>(line.product_id ?? "");
  const [qty, setQty] = useState<number | null>(line.qty);
  const [remember, setRemember] = useState(true);
  const unit = unitOf(state, productId);
  const recipeProduct = state.products.find((p) => p.id === recipe.product_id);
  const convertible = !productId || toBase(line.raw_amount, line.raw_unit, unit) !== null;

  return (
    <tr>
      <td className="main">
        <span className="erpName">
          {line.raw_name?.en ?? "—"}
          {line.raw_name?.vn ? ` / ${line.raw_name.vn}` : ""}
        </span>
        <span className="erpCellSub">
          {line.raw_amount} {line.raw_unit} · {T("рецептура", "recipe", "công thức")}: {recipeProduct ? productTitle(recipeProduct) : "?"}
        </span>
      </td>
      <td className="edit" data-label={T("Продукт", "Product", "Sản phẩm")} style={{ minWidth: 240 }}>
        <ProductPicker
          state={state}
          value={productId}
          onChange={(id) => {
            setProductId(id);
            const converted = toBase(line.raw_amount, line.raw_unit, unitOf(state, id));
            if (converted !== null) setQty(converted);
          }}
        />
        <label className="erpCheck">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {T("Так же в других рецептурах", "Same in other recipes", "Áp dụng cho công thức khác")}
        </label>
      </td>
      <td className="edit" data-label={T("Количество", "Quantity", "Số lượng")}>
        <QtyInput base={unit} value={qty} defaultSmall={unit !== "pcs"} onChange={setQty} />
        {!convertible ? (
          <small className="erpCellSub">
            {T("Единицы разные — укажите количество в", "Units differ — enter the amount in", "Đơn vị khác — nhập theo")} {unitLabel(unit)}
          </small>
        ) : null}
      </td>
      <td className="num">
        <button
          type="button"
          className="erpBtn small primary"
          disabled={busy || !productId || !qty}
          onClick={() => act({ action: "resolveRecipeLine", lineId: line.id, productId, qty: qty!, remember }, T("Ингредиент сопоставлен", "Ingredient linked", "Đã liên kết"))}
        >
          {T("Сопоставить", "Link", "Liên kết")}
        </button>
      </td>
    </tr>
  );
}

function UnitRow({ product }: { product: ErpProduct }) {
  const { act, busy } = useErp();
  const save = (unit: ErpUnit) =>
    act(
      {
        action: "saveProduct",
        product: {
          id: product.id,
          type: product.type,
          name_en: product.name_en,
          name_vn: product.name_vn,
          category_id: product.category_id,
          base_unit: unit,
          unit_weight_kg: product.unit_weight_kg,
          unit_net_weight_kg: product.unit_net_weight_kg ?? null,
          brand: product.brand,
          shelf_life_days: product.shelf_life_days,
          storage_conditions: product.storage_conditions,
        },
      },
      T("Единица сохранена", "Unit saved", "Đã lưu đơn vị"),
    );
  return (
    <tr>
      <td className="main">
        <span className="erpName">{productTitle(product)}</span>
      </td>
      <td data-label={T("В Staff", "In Staff", "Trong Staff")}>
        {product.staff_unit ?? "—"} · {product.staff_pack ?? "—"}
      </td>
      <td data-label={T("Единица", "Unit", "Đơn vị")}>
        <div className="erpRow">
          {(["kg", "l", "pcs"] as ErpUnit[]).map((unit) => (
            <button key={unit} type="button" className="erpBtn small" disabled={busy} onClick={() => save(unit)}>
              {unitLabel(unit)}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
