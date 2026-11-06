"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  costLine,
  DEFAULT_MENU_PRICE_SOURCE,
  isPackaging,
  type ChannelResult,
  type CostContext,
  type CostLine,
  type LossMethod,
  type MenuPriceSource,
} from "@/lib/erp/costing";
import { dishCost, menuCostContext } from "@/lib/erp/menu";
import type { ErpDish, ErpState } from "@/lib/erp/types";
import { notImplemented } from "./CatalogTable";
import { useErp } from "./ErpShell";
import { grossPatch, lossHint, MethodPicker, NetCell, netWeight, netWeightText, type LossLine } from "./losses";
import { MenuFormShell } from "./MenuFormShell";
import { defaultDishCategoryId, isPrepProduct, nameInitials, POSTER_VENUES, POSTER_WORKSHOPS, posterMarkupText, posterYieldG } from "./menuFields";
import { MENU_HREFS } from "./menuNav";
import {
  Empty,
  Field,
  NavLink,
  noSearchResults,
  NumberInput,
  PageHead,
  pct,
  ProductPicker,
  qtyText,
  QtyInput,
  savingText,
  T,
  Tip,
  unitLabel,
  unitOf,
  useDirtyGuard,
  vnd,
} from "./ui";

type DishForm = {
  name_en: string;
  name_vn: string;
  category_id: string;
  sale_price: number | null;
  vat_rate: number | null;
  note: string;
  lines: { product_id: string; qty: number | null; methods: LossMethod[]; net_qty: number | null }[];
  channel_prices: Record<string, number | null>;
};

const issueText = (issue: ChannelResult["issues"][number]) =>
  ({
    no_price: T("нет цены продажи", "no sale price", "chưa có giá bán"),
    no_vat_rate: T("не задан НДС", "no VAT rate", "chưa có VAT"),
    no_commission: T("не задана комиссия канала", "channel commission not set", "chưa có hoa hồng"),
    incomplete_cost: T("себестоимость неполная", "cost incomplete", "giá vốn chưa đủ"),
  })[issue];

const marginNote = () =>
  T(
    "Маржа = цена без НДС − комиссия канала − продукты − упаковка. Это валовая маржа: зарплата, аренда и другие расходы не учтены.",
    "Margin = price without VAT − channel commission − food − packaging. This is gross margin: wages, rent and other costs are not included.",
    "Biên lợi nhuận = giá chưa VAT − hoa hồng − thực phẩm − bao bì. Đây là biên gộp, chưa tính lương, thuê mặt bằng và chi phí khác.",
  );

const isPackagingId = (state: ErpState, id: string | null) => {
  const product = id ? state.products.find((p) => p.id === id) : undefined;
  return product ? isPackaging(product.type) : false;
};

function toForm(dish: ErpDish | null, defaultCategory = ""): DishForm {
  return {
    name_en: dish?.name_en ?? "",
    name_vn: dish?.name_vn ?? "",
    category_id: dish?.category_id ?? defaultCategory,
    sale_price: dish?.sale_price ?? null,
    vat_rate: dish?.vat_rate ?? null,
    note: dish?.note ?? "",
    lines: (dish?.lines ?? []).map((line) => ({
      product_id: line.product_id,
      qty: line.qty,
      methods: line.methods ?? [],
      net_qty: line.net_qty ?? null,
    })),
    channel_prices: Object.fromEntries((dish?.channel_prices ?? []).map((p) => [p.channel_id, p.sale_price])),
  };
}

function calculate(state: ErpState, ctx: CostContext, form: DishForm) {
  const priced = form.lines.filter((l) => l.product_id && l.qty);
  const { summary, channels, main } = dishCost(
    ctx,
    {
      lines: priced.map((l, i) => ({
        id: String(i),
        dish_id: "",
        line_no: i + 1,
        product_id: l.product_id,
        qty: l.qty!,
        note: null,
      })),
      sale_price: form.sale_price,
      vat_rate: form.vat_rate,
      channel_prices: Object.entries(form.channel_prices)
        .filter((entry): entry is [string, number] => entry[1] !== null)
        .map(([channel_id, sale_price]) => ({ channel_id, sale_price })),
    },
    state.settings,
    state.channels,
  );
  const lines = priced.map((l) => costLine(ctx, l.product_id, l.qty!));
  return { lines, summary, channels, main };
}

type Missing = { key: string; name: string; href: string; action: string };

/** Components without a price, each with a page where it can be fixed. */
function missingParts(state: ErpState, lines: CostLine[]): Missing[] {
  const found = new Map<string, Missing>();
  const walk = (line: CostLine, parent: CostLine | null) => {
    if (line.children) {
      line.children.forEach((child) => walk(child, line));
      return;
    }
    if (line.cost !== null) return;
    const product = state.products.find((p) => p.id === line.productId);
    if (line.issue === "unresolved" || line.issue === "cycle" || !product) {
      if (parent) {
        found.set(`r-${parent.productId}`, {
          key: `r-${parent.productId}`,
          name: parent.name,
          href: `/erp/preps/recipe/${parent.productId}`,
          action: T("проверить рецептуру", "check the recipe", "kiểm tra công thức"),
        });
      }
      return;
    }
    found.set(product.id, { key: product.id, name: line.name, href: `/erp/products/${product.id}`, action: T("указать цену", "set a price", "nhập giá") });
  };
  lines.forEach((line) => walk(line, null));
  return [...found.values()];
}

export function MenuPage() {
  const { state } = useErp();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const ctx = useMemo(() => (state ? menuCostContext(state) : null), [state]);
  if (!state || !ctx) return null;

  const q = query.trim().toLowerCase();
  const pool = state.dishes.filter((d) => Boolean(d.archived_at) === archived);
  const dishes = pool.filter((d) => !q || `${d.name_en} ${d.name_vn}`.toLowerCase().includes(q)).sort((a, b) => a.name_en.localeCompare(b.name_en));

  return (
    <>
      <PageHead
        title={T("Меню", "Menu", "Thực đơn")}
        sub={T(
          "Себестоимость блюд и маржа по каналам продаж. Склад здесь не списывается, публичное меню не меняется.",
          "Dish cost and margin per sales channel. Nothing is taken from stock and the public menu is not changed.",
          "Giá vốn món và biên lợi nhuận theo kênh. Không trừ kho, không đổi menu công khai.",
        )}
        actions={
          <NavLink href="/erp/menu/new" className="erpBtn primary">
            + {T("Новое блюдо", "New dish", "Món mới")}
          </NavLink>
        }
      />

      {!state.dishes.length ? (
        <Empty
          title={T("Блюд пока нет", "No dishes yet", "Chưa có món")}
          text={T(
            "Добавьте блюдо и его состав на одну порцию — себестоимость, Food Cost и маржа посчитаются автоматически.",
            "Add a dish and its per-portion composition — cost, food cost and margin are calculated automatically.",
            "Thêm món và thành phần mỗi phần — giá vốn và biên lợi nhuận được tính tự động.",
          )}
          action={
            <NavLink href="/erp/menu/new" className="erpBtn primary">
              {T("Добавить блюдо", "Add a dish", "Thêm món")}
            </NavLink>
          }
        />
      ) : (
        <>
          <div className="erpToolbar">
            <input type="search" placeholder={T("Найти блюдо…", "Find a dish…", "Tìm món…")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="erpCheck">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              {T("Архив", "Archived", "Lưu trữ")}
            </label>
          </div>
          {!dishes.length ? (
            noSearchResults(() => {
              setQuery("");
              setArchived(false);
            })
          ) : (
            <div className="erpTableWrap">
              <table className="erpTable stack">
                <thead>
                  <tr>
                    <th>{T("Блюдо", "Dish", "Món")}</th>
                    <th className="num">{T("Цена продажи", "Sale price", "Giá bán")}</th>
                    <th className="num">{T("Себестоимость с упаковкой", "Cost incl. packaging", "Giá vốn gồm bao bì")}</th>
                    <th className="num">Food Cost</th>
                    <th className="num">{T("Маржа", "Margin", "Biên LN")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dishes.map((dish) => {
                    const { summary, main } = calculate(state, ctx, toForm(dish));
                    return (
                      <tr
                        key={dish.id}
                        className="clickable"
                        onClick={(e) => {
                          if (!(e.target as HTMLElement).closest("a")) router.push(`/erp/menu/${dish.id}`);
                        }}
                      >
                        <td className="main">
                          <NavLink href={`/erp/menu/${dish.id}`} className="erpName">
                            {dish.name_en}
                            {dish.name_vn && dish.name_vn !== dish.name_en ? ` / ${dish.name_vn}` : ""}
                          </NavLink>
                          {!dish.lines.length ? (
                            <span className="erpBadge warn">{T("нет состава", "no composition", "chưa có thành phần")}</span>
                          ) : !summary.complete ? (
                            <span className="erpBadge warn">{T("не все цены известны", "some prices missing", "thiếu giá")}</span>
                          ) : null}
                        </td>
                        <td className="num" data-label={T("Цена продажи", "Sale price", "Giá bán")}>
                          {vnd(dish.sale_price)}
                        </td>
                        <td className="num" data-label={T("Себестоимость", "Cost", "Giá vốn")}>
                          {summary.totalCost === null ? (summary.knownFood + summary.knownPackaging > 0 ? `≥ ${vnd(summary.knownFood + summary.knownPackaging)}` : "—") : vnd(summary.totalCost)}
                        </td>
                        <td className="num" data-label="Food Cost">
                          {pct(main?.foodCostPct)}
                        </td>
                        <td className="num" data-label={T("Маржа", "Margin", "Biên LN")}>
                          {main?.grossProfit === null || main?.grossProfit === undefined ? (
                            "—"
                          ) : (
                            <>
                              {vnd(main.grossProfit)}
                              <span className="erpCellSub">{pct(main.grossMarginPct)}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="erpHint">
            {T("Food Cost и маржа — для канала", "Food cost and margin are for the channel", "Food cost và biên LN theo kênh")} «{state.channels.find((c) => c.code === "direct")?.name ?? state.channels[0]?.name ?? "—"}». {marginNote()}
          </p>
        </>
      )}
    </>
  );
}

export function DishPage({ id }: { id: string }) {
  const { state } = useErp();
  if (!state) return null;
  if (id === "new") return <DishEditor key="new" state={state} dish={null} />;
  const dish = state.dishes.find((d) => d.id === id);
  if (!dish) {
    return (
      <Empty
        kind="error"
        title={T("Блюдо не найдено", "Dish not found", "Không tìm thấy món")}
        action={
          <NavLink href="/erp/menu/recipes" className="erpBtn">
            {T("К тех. картам", "Back to recipes", "Về công thức")}
          </NavLink>
        }
      />
    );
  }
  return <DishEditor key={dish.id} state={state} dish={dish} />;
}

function DishEditor({ state, dish }: { state: ErpState; dish: ErpDish | null }) {
  const { act, busy, notify } = useErp();
  const router = useRouter();
  const defaultCategory = defaultDishCategoryId(state.categories);
  const [form, setForm] = useState<DishForm>(() => toForm(dish, defaultCategory));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toForm(dish, defaultCategory)));
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [priceSource, setPriceSource] = useState<MenuPriceSource>(DEFAULT_MENU_PRICE_SOURCE);
  const workshop = POSTER_WORKSHOPS[0];
  const barcode = "";
  const weighted = false;
  const noDiscount = false;
  const cookMin = "";
  const cookSec = "";
  const venuesOn = Object.fromEntries(POSTER_VENUES.map((item) => [item.id, true]));
  const ctx = useMemo(() => menuCostContext(state, priceSource), [state, priceSource]);
  const dirty = JSON.stringify(form) !== baseline;
  useDirtyGuard(dirty);
  const set = <K extends keyof DishForm>(key: K, value: DishForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const { summary, channels, main, lines } = calculate(state, ctx, form);
  const missing = missingParts(state, lines);
  const portion = netWeight(state, form.lines.filter((l) => !isPackagingId(state, l.product_id)));
  const isNew = !dish;

  const save = async () => {
    const result = await act<{ id: string }>(
      {
        action: "saveDish",
        dish: {
          ...form,
          id: dish?.id,
          lines: form.lines.filter((l) => l.product_id && l.qty),
          channel_prices: Object.entries(form.channel_prices).map(([channel_id, sale_price]) => ({ channel_id, sale_price })),
        },
      },
      isNew ? T("Блюдо создано", "Dish created", "Đã tạo món") : T("Изменения сохранены", "Changes saved", "Đã lưu thay đổi"),
    );
    if (!result) return;
    setBaseline(JSON.stringify(form));
    if (isNew) router.replace(`/erp/menu/${result.id}`);
  };

  const stub = (label: string) => notify({ ok: false, text: notImplemented(label) });
  const compositionTypes = ["ingredient", "semi_finished", "packaging", "consumable"] as const;

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const childRows = (line: CostLine, depth: number, key: string): ReactNode => (
    <Fragment key={key}>
      <tr className="child">
        <td className="main" style={{ paddingLeft: 10 + depth * 18 }}>
          ↳ {line.name}
        </td>
        <td />
        <td data-label={T("Брутто", "Gross", "Brutto")}>{qtyText(line.qty, line.unit)}</td>
        <td />
        <td className="num" data-label={T("Цена за единицу", "Unit cost", "Đơn giá")}>
          {line.unitCost === null ? "—" : `${vnd(line.unitCost)} / ${unitLabel(line.unit)}`}
        </td>
        <td className="num" data-label={T("Стоимость", "Cost", "Thành tiền")}>
          {line.cost === null ? <span className="erpBadge warn">{T("нет цены", "no price", "chưa có giá")}</span> : vnd(line.cost)}
        </td>
        <td />
      </tr>
      {line.children?.map((child, i) => childRows(child, depth + 1, `${key}-${i}`))}
    </Fragment>
  );

  return (
    <MenuFormShell
      backHref={MENU_HREFS.recipes}
      backLabel={T("Тех. карты", "Recipes", "Công thức")}
      activeHref={MENU_HREFS.recipes}
      title={
        <>
          {isNew ? T("Добавление тех. карты", "Add recipe", "Thêm công thức") : T("Редактирование тех. карты", "Edit recipe", "Sửa công thức")}
          {dish?.archived_at ? <span className="erpBadge">{T("в архиве", "archived", "lưu trữ")}</span> : null}
        </>
      }
      sub={form.name_en || form.name_vn || undefined}
      onPrint={() => window.print()}
      footer={
        <>
          {dish ? (
            <button
              type="button"
              className="erpBtn ghost"
              disabled={busy}
              onClick={() =>
                act(
                  { action: "setArchived", entity: "dish", id: dish.id, archived: !dish.archived_at },
                  dish.archived_at ? T("Блюдо восстановлено", "Dish restored", "Đã khôi phục") : T("Блюдо перенесено в корзину", "Dish moved to trash", "Đã chuyển vào thùng rác"),
                )
              }
            >
              {dish.archived_at ? T("Восстановить", "Restore", "Khôi phục") : T("Удалить", "Delete", "Xóa")}
            </button>
          ) : null}
          <button type="button" className="erpBtn primary" disabled={busy || !form.name_en.trim() || (!dirty && !isNew)} onClick={() => void save()}>
            {busy ? savingText() : T("Сохранить", "Save", "Lưu")}
          </button>
        </>
      }
    >
      <section className="erpCard">
        <div className="erpGrid two">
          <Field label={T("Название *", "Name *", "Tên *")}>
            <input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} autoFocus={isNew} />
          </Field>
          <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
            <input value={form.name_vn} onChange={(e) => set("name_vn", e.target.value)} />
          </Field>
          <Field label={T("Категория", "Category", "Nhóm")}>
            <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">{T("Главный экран", "Home screen", "Màn hình chính")}</option>
              {state.categories
                .filter((c) => !c.archived_at || c.id === form.category_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={T("Цех приготовления", "Prep workshop", "Phân xưởng")} hint={T("Не сохраняется — нет workshop_id в API", "Not saved — no workshop_id in the API", "Không lưu — chưa có workshop_id")}>
            <select value={workshop} onChange={() => stub(T("Цех приготовления", "Prep workshop", "Phân xưởng"))}>
              {POSTER_WORKSHOPS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T("Налог", "Tax", "Thuế")}>
            <select value="inherit" onChange={() => stub(T("Налог", "Tax", "Thuế"))}>
              <option value="inherit">{T("Налог родительской категории (Налог не указан)", "Parent category tax (none)", "Thuế nhóm cha (chưa chọn)")}</option>
            </select>
          </Field>
          {state.settings.output_vat_enabled ? (
            <Field label={T("НДС, %", "VAT, %", "VAT, %")} hint={`${T("По умолчанию", "Default", "Mặc định")}: ${state.settings.default_output_vat_rate ?? "—"}%`}>
              <NumberInput value={form.vat_rate} onChange={(v) => set("vat_rate", v)} />
            </Field>
          ) : null}
        </div>
        <div className="erpRow" style={{ marginTop: 12, gap: 16, alignItems: "flex-start" }}>
          <div className="erpMenuCover" aria-hidden>
            {nameInitials(form.name_en)}
          </div>
          <div>
            <label className="erpCheck">
              <input type="checkbox" checked={weighted} onChange={() => stub(T("Весовая тех. карта", "Weighable recipe", "Công thức theo cân"))} />
              {T("Весовая тех. карта", "Weighable recipe", "Công thức theo cân")}
            </label>
            <label className="erpCheck">
              <input type="checkbox" checked={noDiscount} onChange={() => stub(T("Не участвует в скидках", "Excluded from discounts", "Không áp dụng giảm giá"))} />
              {T("Не участвует в скидках", "Excluded from discounts", "Không áp dụng giảm giá")}
            </label>
          </div>
        </div>
        <div className="erpGrid two" style={{ marginTop: 12 }}>
          <Field label={T("Цена", "Price", "Giá")}>
            <NumberInput value={form.sale_price} onChange={(v) => set("sale_price", v)} />
          </Field>
          <Field label={T("Наценка до налога", "Markup before tax", "Phụ thu trước thuế")}>
            <input readOnly value={posterMarkupText(form.sale_price, summary.totalCost)} />
          </Field>
          <Field label={T("Себестоимость без НДС", "Cost excl. VAT", "Giá vốn chưa VAT")}>
            <span className={summary.totalCost === 0 ? "erpCostZero" : undefined}>{summary.totalCost == null ? "—" : vnd(summary.totalCost)}</span>
          </Field>
        </div>
      </section>

      <section className="erpCard">
        <h2>{T("Настройки цен и отображение для заведений", "Venue prices and visibility", "Giá và hiện theo cơ sở")}</h2>
        <p className="erpMenuStub">{T("Тумблеры не сохраняются: доступность по заведению в API нет.", "Toggles are not saved: per-venue availability is not in the API.", "Công tắc không lưu: chưa có API theo cơ sở.")}</p>
        <div className="erpMenuVenues">
          {POSTER_VENUES.map((venue) => (
            <div key={venue.id} className="erpMenuVenueRow">
              <label className="erpCheck">
                <input
                  type="checkbox"
                  checked={venuesOn[venue.id] ?? true}
                  onChange={() => stub(T("Отображение в заведении", "Venue visibility", "Hiện tại cơ sở"))}
                />
                {venue.label}
              </label>
              <strong>{vnd(form.sale_price)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="erpCard">
        <h2>{T("Дополнительно", "More", "Thêm")}</h2>
        <div className="erpGrid two">
          <Field label={T("Штрихкод", "Barcode", "Mã vạch")} hint={T("Нет в API", "Not in the API", "Chưa có API")}>
            <input readOnly value={barcode} placeholder={T("нет в API", "not in API", "chưa có API")} onFocus={() => stub(T("Штрихкод", "Barcode", "Mã vạch"))} />
          </Field>
          <Field label={T("Время приготовления", "Prep time", "Thời gian nấu")} hint={T("Нет в API", "Not in the API", "Chưa có API")}>
            <span className="erpRow">
              <input readOnly value={cookMin} placeholder={T("мин", "min", "phút")} style={{ width: 80 }} onFocus={() => stub(T("Время приготовления", "Prep time", "Thời gian nấu"))} />
              <input readOnly value={cookSec} placeholder={T("с", "sec", "giây")} style={{ width: 80 }} onFocus={() => stub(T("Время приготовления", "Prep time", "Thời gian nấu"))} />
            </span>
          </Field>
          <Field label={T("Процесс приготовления", "Cooking process", "Quy trình nấu")} wide>
            <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={4} />
          </Field>
        </div>
      </section>

      <section className="erpCard">
        <h2>{T("Ингредиенты и полуфабрикаты, из которых состоит тех. карта", "Ingredients and preps in this recipe", "Nguyên liệu và bán thành phẩm của công thức")}</h2>
        {form.lines.length ? (
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <thead>
                <tr>
                  <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                  <th>{T("Метод приготовления", "Cooking method", "Cách chế biến")}</th>
                  <th>{T("Брутто", "Gross", "Brutto")}</th>
                  <th>{T("Нетто", "Net", "Netto")}</th>
                  <th className="num">{T("Цена за единицу", "Unit cost", "Đơn giá")}</th>
                  <th className="num">{T("Стоимость", "Cost", "Thành tiền")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => {
                  const unit = unitOf(state, line.product_id);
                  const cost = line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty) : null;
                  const expanded = open.has(index);
                  const updateLine = (patch: Partial<LossLine>) =>
                    set(
                      "lines",
                      form.lines.map((l, i) => (i === index ? ({ ...l, ...patch } as DishForm["lines"][number]) : l)),
                    );
                  return (
                    <Fragment key={index}>
                      <tr className={cost && cost.cost === null ? "short" : ""}>
                        <td className="main" style={{ minWidth: 240 }}>
                          <ProductPicker
                            state={state}
                            value={line.product_id}
                            types={[...compositionTypes]}
                            onChange={(productId) => updateLine({ product_id: productId, methods: [], net_qty: null })}
                          />
                          <span className="erpRow">
                            {isPrepProduct(state.products.find((p) => p.id === line.product_id)) ? <span className="erpMenuPrep">{T("(п/ф)", "(prep)", "(bán TP)")}</span> : null}
                            {cost?.packaging ? <span className="erpBadge">{T("упаковка", "packaging", "bao bì")}</span> : null}
                            {cost?.children ? (
                              <button type="button" className="erpLink" onClick={() => toggle(index)}>
                                {expanded ? T("скрыть состав", "hide composition", "ẩn thành phần") : T("показать состав", "show composition", "xem thành phần")}
                              </button>
                            ) : null}
                          </span>
                        </td>
                        <td className="edit" data-label={T("Обработка", "Processing", "Sơ chế")}>
                          <MethodPicker state={state} line={line} onChange={updateLine} />
                        </td>
                        <td className="edit" data-label={T("Брутто", "Gross", "Brutto")}>
                          {line.product_id ? (
                            <QtyInput base={unit} value={line.qty} defaultSmall={unit !== "pcs"} onChange={(v) => updateLine(grossPatch(state, line, v))} />
                          ) : (
                            <span className="erpMuted">{T("сначала выберите продукт", "choose a product first", "chọn sản phẩm trước")}</span>
                          )}
                        </td>
                        <td className={line.methods.length ? "edit" : ""} data-label={T("Нетто", "Net", "Netto")}>
                          <NetCell state={state} line={line} onChange={updateLine} />
                        </td>
                        <td className="num" data-label={T("Цена за единицу", "Unit cost", "Đơn giá")}>
                          {!cost || cost.unitCost === null ? "—" : `${vnd(cost.unitCost)} / ${unitLabel(unit)}`}
                        </td>
                        <td className="num" data-label={T("Стоимость", "Cost", "Thành tiền")}>
                          {!cost ? "—" : cost.cost === null ? <span className="erpBadge warn">{T("нет цены", "no price", "chưa có giá")}</span> : vnd(cost.cost)}
                        </td>
                        <td className="num">
                          <button type="button" className="erpIconBtn" aria-label={T("Убрать строку", "Remove line", "Xóa dòng")} onClick={() => set("lines", form.lines.filter((_, i) => i !== index))}>
                            ×
                          </button>
                        </td>
                      </tr>
                      {expanded && cost?.children ? cost.children.map((child, i) => childRows(child, 1, `${index}-${i}`)) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="erpHint">
            <p>{T("Заполните составляющие тех. карты для расчёта её себестоимости", "Fill in the recipe components to calculate cost", "Điền thành phần công thức để tính giá vốn")}</p>
            <p>
              {T(
                "Выберите существующие или создайте новые продукты по рецепту и добавьте ещё расходники: упаковку и посуду для доставки, одноразовые приборы, стики сахара и т. д.",
                "Pick existing products or create new ones for the recipe, then add consumables: packaging, delivery ware, disposables, sugar sticks, and so on.",
                "Chọn sản phẩm có sẵn hoặc tạo mới, rồi thêm vật tư: bao bì, đồ giao hàng, dụng cụ dùng một lần…",
              )}
            </p>
          </div>
        )}
        <div className="erpActions">
          <button type="button" className="erpBtn" onClick={() => set("lines", [...form.lines, { product_id: "", qty: null, methods: [], net_qty: null }])}>
            + {isNew ? T("Добавить продукт", "Add product", "Thêm sản phẩm") : T("Добавить ингредиент", "Add ingredient", "Thêm nguyên liệu")}
          </button>
        </div>
        {form.lines.length ? <p className="erpHint">{lossHint()}</p> : null}

        {missing.length ? (
          <div className="erpNotice warn">
            <strong>{T("Себестоимость неполная — не хватает цен", "Cost is incomplete — prices missing", "Giá vốn chưa đủ — thiếu giá")}</strong>
            <ul>
              {missing.map((m) => (
                <li key={m.key}>
                  {m.name} —{" "}
                  <NavLink href={m.href} className="erpLink">
                    {m.action}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="erpKpis">
          <div className="erpKpi">
            <span>{T("Продукты", "Food", "Thực phẩm")}</span>
            <strong>{summary.foodCost === null ? `≥ ${vnd(summary.knownFood)}` : vnd(summary.foodCost)}</strong>
          </div>
          <div className="erpKpi">
            <span>{T("Упаковка", "Packaging", "Bao bì")}</span>
            <strong>{summary.packagingCost === null ? `≥ ${vnd(summary.knownPackaging)}` : vnd(summary.packagingCost)}</strong>
          </div>
          <div className="erpKpi main">
            <span>{T("Себестоимость порции", "Portion cost", "Giá vốn mỗi phần")}</span>
            <strong>{summary.totalCost === null ? T("неполная", "incomplete", "chưa đủ") : vnd(summary.totalCost)}</strong>
          </div>
          <div className="erpKpi">
            <span>{T("Цена продажи", "Sale price", "Giá bán")}</span>
            <strong>{vnd(form.sale_price)}</strong>
          </div>
          <div className="erpKpi">
            <span>Food Cost</span>
            <strong>{pct(main?.foodCostPct)}</strong>
          </div>
          <div className="erpKpi">
            <span>{T("Маржа", "Margin", "Biên LN")}</span>
            <strong>{main?.grossProfit === null || main?.grossProfit === undefined ? "—" : `${vnd(main.grossProfit)} · ${pct(main.grossMarginPct)}`}</strong>
          </div>
          <div className="erpKpi">
            <span>{T("Выход", "Yield", "Định lượng")}</span>
            <strong>{portion.kg ? posterYieldG(portion.kg) : netWeightText(portion)}</strong>
          </div>
        </div>
        <p className="erpHint">{T("Выход на форме в граммах, в списке — в кг. Состав не списывает склад.", "Yield is grams on the form and kilograms on the list. Composition does not move stock.", "Định lượng trên form là gram, trên danh sách là kg. Thành phần không trừ kho.")}</p>
      </section>

      {channels.length ? (
        <section className="erpCard">
          <h2>
            {T("Каналы продаж", "Sales channels", "Kênh bán")}{" "}
            <Tip>{marginNote()}</Tip>
          </h2>
          <div className="erpTableWrap">
            <table className="erpTable stack">
              <thead>
                <tr>
                  <th>{T("Канал", "Channel", "Kênh")}</th>
                  <th>{T("Цена, ₫", "Price, ₫", "Giá, ₫")}</th>
                  <th className="num">{T("Комиссия", "Commission", "Hoa hồng")}</th>
                  {state.settings.output_vat_enabled ? <th className="num">{T("НДС", "VAT", "VAT")}</th> : null}
                  <th className="num">Food Cost</th>
                  <th className="num">{T("Себестоимость с упаковкой, %", "Cost incl. packaging, %", "Giá vốn gồm bao bì, %")}</th>
                  <th className="num">{T("Маржа", "Margin", "Biên LN")}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id}>
                    <td className="main">
                      <span className="erpName">{channel.name}</span>
                      {channel.issues.length ? <span className="erpCellSub">{channel.issues.map(issueText).join(", ")}</span> : null}
                    </td>
                    <td className="edit" data-label={T("Цена, ₫", "Price, ₫", "Giá, ₫")} style={{ minWidth: 120 }}>
                      <NumberInput
                        value={form.channel_prices[channel.id] ?? null}
                        placeholder={form.sale_price === null ? "" : `${form.sale_price} (${T("как в меню", "menu price", "như menu")})`}
                        onChange={(v) => set("channel_prices", { ...form.channel_prices, [channel.id]: v })}
                      />
                    </td>
                    <td className="num" data-label={T("Комиссия", "Commission", "Hoa hồng")}>
                      {vnd(channel.commission)}
                      {channel.commissionPct !== null ? <span className="erpCellSub">{channel.commissionPct}%</span> : null}
                    </td>
                    {state.settings.output_vat_enabled ? (
                      <td className="num" data-label={T("НДС", "VAT", "VAT")}>
                        {vnd(channel.vat)}
                      </td>
                    ) : null}
                    <td className="num" data-label="Food Cost">
                      {pct(channel.foodCostPct)}
                    </td>
                    <td className="num" data-label={T("С упаковкой", "Incl. packaging", "Gồm bao bì")}>
                      {pct(channel.totalCostPct)}
                    </td>
                    <td className="num" data-label={T("Маржа", "Margin", "Biên LN")}>
                      {channel.grossProfit === null ? (
                        "—"
                      ) : (
                        <>
                          {vnd(channel.grossProfit)}
                          <span className="erpCellSub">{pct(channel.grossMarginPct)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="erpHint">{T("Пустая цена канала = цена в меню. Проценты считаются от цены без НДС.", "An empty channel price means the menu price. Percentages are of the price without VAT.", "Giá kênh trống = giá menu. Phần trăm tính trên giá chưa VAT.")}</p>
        </section>
      ) : null}

      <section className="erpCard">
        <h2>{T("Модификаторы", "Modifiers", "Tùy chọn")}</h2>
        <p className="erpHint">
          {T(
            "В Poster модификаторы доступны в тарифах Business и Pro. Набора в ERP нет — добавить нельзя.",
            "In Poster, modifiers need Business or Pro. The ERP has no modifier sets — add is not implemented.",
            "Poster cần gói Business/Pro. ERP chưa có bộ tùy chọn — thêm chưa làm.",
          )}
        </p>
        <button type="button" className="erpLink" onClick={() => stub(T("Добавить набор модификаторов", "Add a modifier set", "Thêm bộ tùy chọn"))}>
          + {T("Добавить набор модификаторов...", "Add a modifier set...", "Thêm bộ tùy chọn...")}
        </button>
      </section>
    </MenuFormShell>
  );
}
