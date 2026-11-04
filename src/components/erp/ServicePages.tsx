"use client";

import { useState } from "react";
import { productLabel, type ErpUnit } from "@/lib/erp/costing";
import type { ErpChannel, ErpProduct, ErpRecipe, ErpRecipeLine, ErpSettings, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { RefList } from "./RefList";
import { productsWithoutPack, productsWithoutUnit, unresolvedLines } from "./review";
import { Field, NavLink, NumberInput, PageHead, ProductPicker, QtyInput, savingText, SubTabs, T, toBase, unitLabel, unitOf, useDirtyGuard } from "./ui";

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

  return (
    <>
      <ServiceHead active="/erp/service" />

      <section className="erpCard">
        <h2>{T("НДС", "VAT", "VAT")}</h2>
        <div className="erpGrid two">
          <label className="erpCheck">
            <input type="checkbox" checked={form.input_vat_enabled} onChange={(e) => set("input_vat_enabled", e.target.checked)} />
            {T("Учитывать входящий НДС в поставках", "Track input VAT on deliveries", "Tính VAT đầu vào khi nhập hàng")}
          </label>
          <Field label={T("Входящий НДС по умолчанию, %", "Default input VAT, %", "VAT đầu vào mặc định, %")}>
            <NumberInput value={form.default_input_vat_rate} disabled={!form.input_vat_enabled} onChange={(v) => set("default_input_vat_rate", v)} />
          </Field>
          <label className="erpCheck">
            <input type="checkbox" checked={form.output_vat_enabled} onChange={(e) => set("output_vat_enabled", e.target.checked)} />
            {T("Цены в меню включают НДС", "Menu prices include VAT", "Giá menu đã gồm VAT")}
          </label>
          <Field label={T("НДС с продаж по умолчанию, %", "Default sales VAT, %", "VAT đầu ra mặc định, %")}>
            <NumberInput value={form.default_output_vat_rate} disabled={!form.output_vat_enabled} onChange={(v) => set("default_output_vat_rate", v)} />
          </Field>
        </div>
        <p className="erpHint">
          {T(
            "Входящий НДС включён — себестоимость считается без НДС. Выключен — себестоимость равна оплаченной сумме. НДС с продаж включён — маржа считается от цены без НДС. Изменение настроек не пересчитывает уже подтверждённые документы.",
            "With input VAT on, cost excludes VAT; off — cost is the amount paid. With sales VAT on, margin is calculated from the price without VAT. Changing settings never recalculates confirmed documents.",
            "Bật VAT đầu vào: giá vốn không gồm VAT. Bật VAT đầu ra: biên LN tính trên giá chưa VAT. Chứng từ đã xác nhận không bị tính lại.",
          )}
        </p>
        <div className="erpActions end">
          <button
            type="button"
            className="erpBtn primary"
            disabled={busy || !dirty}
            onClick={async () => {
              if (await act({ action: "saveSettings", settings: form }, T("Настройки сохранены", "Settings saved", "Đã lưu cài đặt"))) setSaved(JSON.stringify(form));
            }}
          >
            {busy ? savingText() : T("Сохранить настройки", "Save settings", "Lưu cài đặt")}
          </button>
        </div>
      </section>

      <section className="erpCard">
        <h2>{T("Каналы продаж и комиссии", "Sales channels and commission", "Kênh bán và hoa hồng")}</h2>
        <p className="erpHint">
          {T(
            "Комиссия — доля площадки от цены в меню (Grab Food, Shopee Food…). Пусто — комиссия не задана, расчёт маржи будет отмечен как неполный.",
            "Commission is the platform share of the menu price (Grab Food, Shopee Food…). Empty means not set — margin is marked incomplete.",
            "Hoa hồng là % trên giá bán. Để trống = chưa đặt.",
          )}
        </p>
        <RefList<ErpChannel>
          entity="channel"
          rows={state.channels}
          columns={[
            { key: "name", label: T("Канал", "Channel", "Kênh") },
            { key: "commission_pct", label: T("Комиссия, %", "Commission, %", "Hoa hồng, %"), kind: "number" },
          ]}
          addLabel={T("Добавить канал", "Add channel", "Thêm kênh")}
          emptyTitle={T("Каналов продаж пока нет", "No sales channels yet", "Chưa có kênh bán")}
          emptyText={T("Например: в заведении, Grab Food, Shopee Food.", "For example: dine-in, Grab Food, Shopee Food.", "Ví dụ: tại quán, Grab Food, Shopee Food.")}
        />
      </section>
    </>
  );
}

type ImportResult = Record<string, number>;

/** Staff catalog import: runs only when the user presses the button. */
export function StaffImportCard({ compact }: { compact?: boolean }) {
  const { state, act, busy } = useErp();
  const [result, setResult] = useState<ImportResult | null>(null);
  if (!state) return null;
  const noUnit = productsWithoutUnit(state).length;
  return (
    <section className="erpCard">
      <h2>{T("Загрузите существующие продукты из Staff", "Import existing products from Staff", "Nhập sản phẩm có sẵn từ Staff")}</h2>
      <p className="erpHint">
        {T(
          "Продукты, поставщики и категории из приложения заказов Staff попадут в каталог. Повторная загрузка ничего не дублирует и не затирает то, что вы уже поправили здесь.",
          "Products, suppliers and categories from the Staff ordering app go into the catalog. Running it again creates no duplicates and keeps your edits.",
          "Sản phẩm, nhà cung cấp và nhóm hàng từ Staff sẽ vào danh mục. Chạy lại không tạo trùng.",
        )}
      </p>
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn primary"
          disabled={busy}
          onClick={async () => setResult((await act<{ result: ImportResult }>({ action: "importStaffCatalog" }, false))?.result ?? null)}
        >
          {busy ? T("Загрузка…", "Importing…", "Đang nhập…") : T("Загрузить продукты из Staff", "Import products from Staff", "Nhập sản phẩm từ Staff")}
        </button>
      </div>
      {result ? (
        <div className="erpNotice ok">
          <strong>{T("Готово", "Done", "Xong")}</strong>
          <ul>
            <li>
              {T("Новых продуктов", "New products", "Sản phẩm mới")}: {result.created ?? 0}
            </li>
            <li>
              {T("Обновлено", "Updated", "Đã cập nhật")}: {result.updated ?? 0}
            </li>
            {result.pack_review ? (
              <li>
                {T("Упаковок нужно уточнить", "Packs to check", "Quy cách cần kiểm tra")}: {result.pack_review}
              </li>
            ) : null}
          </ul>
          <p>
            {T("Следующий шаг", "Next step", "Bước tiếp theo")}:{" "}
            {noUnit ? (
              <NavLink href="/erp/service/review" className="erpLink">
                {T(`выберите единицу учёта для ${noUnit} продуктов`, `choose a unit for ${noUnit} products`, `chọn đơn vị cho ${noUnit} sản phẩm`)}
              </NavLink>
            ) : compact ? (
              <NavLink href="/erp/products" className="erpLink">
                {T("откройте каталог продуктов", "open the product catalog", "mở danh mục sản phẩm")}
              </NavLink>
            ) : (
              <NavLink href="/erp/stock" className="erpLink">
                {T("внесите остатки или примите первую поставку", "enter opening stock or receive the first delivery", "nhập tồn đầu kỳ hoặc nhận hàng")}
              </NavLink>
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function RecipesImportCard() {
  const { state, act, busy } = useErp();
  const [result, setResult] = useState<ImportResult | null>(null);
  if (!state) return null;
  return (
    <section className="erpCard">
      <h2>{T("Загрузить рецептуры полуфабрикатов", "Import semi-finished recipes", "Nhập công thức bán thành phẩm")}</h2>
      <p className="erpHint">
        {T(
          "Рецептуры из приложения Recipes появятся как черновики. Ингредиенты, которые не удалось сопоставить с продуктами, попадут в «Проверку данных». Действующие рецептуры не меняются.",
          "Recipes from the Recipes app arrive as drafts. Ingredients that could not be matched go to “Data check”. Active recipes are not changed.",
          "Công thức từ Recipes sẽ là bản nháp. Nguyên liệu chưa khớp sẽ ở mục Kiểm tra dữ liệu.",
        )}
      </p>
      <div className="erpActions">
        <button
          type="button"
          className="erpBtn"
          disabled={busy || !state.products.length}
          onClick={async () => setResult((await act<{ result: ImportResult }>({ action: "importRecipes" }, false))?.result ?? null)}
        >
          {T("Загрузить рецептуры", "Import recipes", "Nhập công thức")}
        </button>
      </div>
      {!state.products.length ? <p className="erpHint">{T("Сначала загрузите продукты из Staff — рецептуры ссылаются на них.", "Import products from Staff first — recipes refer to them.", "Nhập sản phẩm trước.")}</p> : null}
      {result ? (
        <div className="erpNotice ok">
          <strong>{T("Готово", "Done", "Xong")}</strong>
          <ul>
            <li>
              {T("Новых рецептур", "New recipes", "Công thức mới")}: {result.created ?? 0}
            </li>
            <li>
              {T("Обновлено черновиков", "Drafts refreshed", "Nháp đã làm mới")}: {result.refreshed ?? 0}
            </li>
            <li>
              {T("Оставлено без изменений (уже действуют)", "Kept (already active)", "Giữ nguyên")}: {result.kept ?? 0}
            </li>
            <li>
              {T("Ингредиентов нужно сопоставить", "Ingredients to link", "Nguyên liệu cần liên kết")}: {result.unresolved ?? 0}
            </li>
          </ul>
          <p>
            {T("Следующий шаг", "Next step", "Bước tiếp theo")}:{" "}
            <NavLink href={result.unresolved ? "/erp/service/review" : "/erp/preps"} className="erpLink">
              {result.unresolved ? T("сопоставьте ингредиенты", "link the ingredients", "liên kết nguyên liệu") : T("проверьте рецептуры и сделайте их действующими", "review the recipes and make them active", "kiểm tra và áp dụng công thức")}
            </NavLink>
          </p>
        </div>
      ) : null}
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
                      <span className="erpName">{productLabel(product)}</span>
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
          {line.raw_amount} {line.raw_unit} · {T("рецептура", "recipe", "công thức")}: {recipeProduct ? productLabel(recipeProduct) : "?"}
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
        <span className="erpName">{productLabel(product)}</span>
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
