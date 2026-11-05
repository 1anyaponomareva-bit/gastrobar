"use client";

import { useState } from "react";
import { productTitle, type ErpUnit } from "@/lib/erp/costing";
import type { ErpChannel, ErpProduct, ErpRecipe, ErpRecipeLine, ErpSettings, ErpState, StaffMergeResult } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { RefList } from "./RefList";
import { productsWithoutPack, productsWithoutUnit, unresolvedLines } from "./review";
import { errorText, Field, NavLink, NumberInput, PageHead, ProductPicker, QtyInput, savingText, SubTabs, T, toBase, unitLabel, unitOf, useDirtyGuard } from "./ui";

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

      <SpeedCard />
    </>
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

type ImportResult = Record<string, number>;

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
            <NavLink href="/erp/products" className="erpLink">
              {T("Открыть каталог продуктов", "Open the product catalog", "Mở danh mục sản phẩm")}
            </NavLink>
          ) : null}
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
