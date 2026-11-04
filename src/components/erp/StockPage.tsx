"use client";

import { useEffect, useState } from "react";
import { productLabel } from "@/lib/erp/costing";
import type { ErpDocType, ErpSupplier, ErpWarehouse } from "@/lib/erp/types";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { MovementReport } from "./MovementReport";
import { RefList } from "./RefList";
import { StockMobileNav } from "./stockNav";
import { dateText, Empty, NavLink, noSearchResults, PageHead, qtyText, T, today, typeLabel, unitLabel, vnd } from "./ui";

export const STOCK_KINDS: Record<string, { types: ErpDocType[]; newHref: string }> = {
  receipts: { types: ["receipt", "opening"], newHref: "/erp/documents/new?type=receipt" },
  processing: { types: ["production"], newHref: "/erp/preps/batch/new" },
  transfers: { types: ["transfer"], newHref: "/erp/documents/new?type=transfer" },
  writeoffs: { types: ["writeoff"], newHref: "/erp/documents/new?type=writeoff" },
  counts: { types: ["count"], newHref: "/erp/documents/new?type=count" },
};

export const stockKindOf = (type: ErpDocType) =>
  type === "receipt" || type === "opening"
    ? "receipts"
    : type === "transfer"
      ? "transfers"
      : type === "writeoff"
        ? "writeoffs"
        : type === "count"
          ? "counts"
          : "processing";

export function StockReportPage() {
  return <MovementReport tabs={<StockMobileNav active="/erp/stock/report" />} />;
}

const addText = () => T("Добавить", "Add", "Thêm");

const newDocHref = (type: ErpDocType, warehouseId?: string) => `/erp/documents/new?type=${type}${warehouseId ? `&warehouse=${warehouseId}` : ""}`;

function StockActions({ warehouseId }: { warehouseId?: string }) {
  return (
    <div className="erpQuick compact">
      <NavLink href={newDocHref("receipt", warehouseId)} className="erpBtn primary">
        {T("Принять поставку", "Receive delivery", "Nhận hàng")}
      </NavLink>
      <NavLink href={newDocHref("transfer", warehouseId)} className="erpBtn">
        {T("Переместить", "Move", "Chuyển kho")}
      </NavLink>
      <NavLink href={newDocHref("writeoff", warehouseId)} className="erpBtn">
        {T("Списать", "Write off", "Xuất hủy")}
      </NavLink>
      <NavLink href={newDocHref("count", warehouseId)} className="erpBtn">
        {T("Провести инвентаризацию", "Count stock", "Kiểm kê")}
      </NavLink>
    </div>
  );
}

const WAREHOUSE_KEY = "gastrofood-erp-warehouse";

export function StockPage() {
  const { state } = useErp();
  const [warehouseId, setWarehouseId] = useState("");
  const [query, setQuery] = useState("");
  const active = state?.warehouses.filter((w) => !w.archived_at) ?? [];

  useEffect(() => {
    if (!state || warehouseId) return;
    const stored = window.localStorage.getItem(WAREHOUSE_KEY);
    const list = state.warehouses.filter((w) => !w.archived_at);
    setWarehouseId(list.find((w) => w.id === stored)?.id ?? list.find((w) => w.kind === "warehouse")?.id ?? list[0]?.id ?? "");
  }, [state, warehouseId]);

  if (!state) return null;

  const choose = (id: string) => {
    setWarehouseId(id);
    window.localStorage.setItem(WAREHOUSE_KEY, id);
  };

  const products = new Map(state.products.map((p) => [p.id, p]));
  const all = state.stock
    .filter((row) => row.warehouse_id === warehouseId && row.qty !== 0)
    .map((row) => ({ row, product: products.get(row.product_id)! }))
    .filter((entry) => entry.product)
    .sort((a, b) => a.product.name_en.localeCompare(b.product.name_en));
  const q = query.trim().toLowerCase();
  const rows = all.filter(({ product }) => !q || `${product.name_en} ${product.name_vn} ${product.brand ?? ""}`.toLowerCase().includes(q));
  const known = all.reduce((sum, { row }) => sum + (row.known_value ?? 0), 0);
  const incomplete = all.some(({ row }) => !row.cost_known);
  const now = today();
  const soon = (() => {
    const d = new Date(`${now}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 2);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <>
      <PageHead title={T("Остатки", "Balances", "Tồn kho")} sub={T("Сколько продуктов лежит на каждом складе и на какую сумму.", "How much of each product is at each location, and its value.", "Số lượng và giá trị hàng tại từng kho.")} />
      <StockMobileNav active="/erp/stock" />
      <StockActions warehouseId={warehouseId || undefined} />

      {!active.length ? (
        <Empty
          title={T("Складов пока нет", "No locations yet", "Chưa có kho")}
          text={T("Добавьте склады: основной склад, кухня заготовок, фудтрак…", "Add locations: main warehouse, prep kitchen, food truck…", "Thêm kho: kho chính, bếp sơ chế, xe bán đồ ăn…")}
          action={
            <NavLink href="/erp/stock/warehouses" className="erpBtn primary">
              {T("Добавить склад", "Add location", "Thêm kho")}
            </NavLink>
          }
        />
      ) : (
        <>
          <div className="erpToolbar">
            <select value={warehouseId} onChange={(e) => choose(e.target.value)} aria-label={T("Склад", "Location", "Kho")}>
              {active.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {all.length > 8 ? (
              <input type="search" placeholder={T("Найти продукт…", "Find a product…", "Tìm sản phẩm…")} value={query} onChange={(e) => setQuery(e.target.value)} />
            ) : null}
          </div>

          {!all.length ? (
            <Empty
              title={T("На этом складе пока ничего нет", "Nothing at this location yet", "Kho này chưa có hàng")}
              text={T(
                "Остатки появятся после поставки, перемещения или изготовления партии. Если продукты уже лежат на складе — внесите начальные остатки.",
                "Stock appears after a delivery, transfer or production. If products are already here, enter opening balances.",
                "Tồn kho sẽ xuất hiện sau khi nhập hàng, chuyển kho hoặc sản xuất.",
              )}
              action={
                <>
                  <NavLink href={newDocHref("receipt", warehouseId)} className="erpBtn primary">
                    {T("Принять поставку", "Receive delivery", "Nhận hàng")}
                  </NavLink>
                  <NavLink href={newDocHref("opening", warehouseId)} className="erpBtn">
                    {T("Внести начальные остатки", "Enter opening balances", "Nhập tồn đầu kỳ")}
                  </NavLink>
                </>
              }
            />
          ) : (
            <>
              <div className="erpKpis">
                <div className="erpKpi">
                  <span>{T("Позиций", "Items", "Mặt hàng")}</span>
                  <strong>{all.length}</strong>
                </div>
                <div className="erpKpi">
                  <span>{T("Стоимость остатков", "Stock value", "Giá trị tồn")}</span>
                  <strong>
                    {incomplete ? "≥ " : ""}
                    {vnd(known)}
                  </strong>
                </div>
              </div>
              {incomplete ? (
                <p className="erpHint">
                  {T(
                    "У части продуктов цена закупки неизвестна — показана стоимость только известной части.",
                    "Some items have no purchase price — only the known part is counted.",
                    "Một số mặt hàng chưa có giá — chỉ tính phần đã biết.",
                  )}
                </p>
              ) : null}
              {!rows.length ? (
                noSearchResults(() => setQuery(""))
              ) : (
                <div className="erpTableWrap">
                  <table className="erpTable stack">
                    <thead>
                      <tr>
                        <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                        <th className="num">{T("Количество", "Quantity", "Số lượng")}</th>
                        <th className="num">{T("Стоимость", "Value", "Giá trị")}</th>
                        <th className="num">{T("Цена за единицу", "Unit cost", "Giá / đơn vị")}</th>
                        <th>{T("Ближайший срок", "Nearest use-by", "Hạn gần nhất")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ row, product }) => {
                        const expiry = row.nearest_expiry;
                        return (
                          <tr key={row.product_id} className={row.qty < 0 ? "short" : ""}>
                            <td className="main">
                              <NavLink href={`/erp/products/${product.id}`} className="erpName">
                                {productLabel(product)}
                              </NavLink>
                              <span className="erpCellSub">{typeLabel(product.type)}</span>
                            </td>
                            <td className="num" data-label={T("Количество", "Quantity", "Số lượng")}>
                              <strong>{qtyText(row.qty, product.base_unit)}</strong>
                            </td>
                            <td className="num" data-label={T("Стоимость", "Value", "Giá trị")}>
                              {row.cost_known ? vnd(row.known_value) : <span className="erpBadge warn">{T("цена неизвестна", "price unknown", "chưa rõ giá")}</span>}
                            </td>
                            <td className="num" data-label={T("Цена за единицу", "Unit cost", "Giá / đơn vị")}>
                              {row.cost_known && row.qty ? `${vnd((row.known_value ?? 0) / row.qty)} / ${unitLabel(product.base_unit)}` : "—"}
                            </td>
                            <td data-label={T("Ближайший срок", "Nearest use-by", "Hạn gần nhất")}>
                              {!expiry ? (
                                "—"
                              ) : expiry < now ? (
                                <span className="erpBadge bad">
                                  {T("просрочено", "expired", "hết hạn")} {dateText(expiry)}
                                </span>
                              ) : expiry <= soon ? (
                                <span className="erpBadge warn">{dateText(expiry)}</span>
                              ) : (
                                dateText(expiry)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

const kindTexts = (): Record<string, { title: string; sub: string; empty: string; text: string }> => ({
  receipts: {
    title: T("Поставки", "Deliveries", "Nhập hàng"),
    sub: T("Принятые поставки от поставщиков и начальные остатки.", "Deliveries received from suppliers and opening balances.", "Hàng nhập từ nhà cung cấp và tồn đầu kỳ."),
    empty: T("Поставок ещё не было", "No deliveries yet", "Chưa có lần nhập hàng"),
    text: T("Принятые поставки и начальные остатки появятся здесь.", "Received deliveries and opening balances appear here.", "Các lần nhập hàng sẽ hiện ở đây."),
  },
  processing: {
    title: T("Переработки", "Processing", "Chế biến"),
    sub: T(
      "Изготовление полуфабрикатов по рецептуре: сырьё списывается со склада, готовый полуфабрикат приходуется.",
      "Making semi-finished products from a recipe: ingredients leave stock, the finished product is added.",
      "Sản xuất bán thành phẩm theo công thức: trừ nguyên liệu, nhập thành phẩm vào kho.",
    ),
    empty: T("Переработок ещё не было", "No processing yet", "Chưa có lần chế biến"),
    text: T("Здесь появятся изготовленные партии полуфабрикатов и черновики.", "Produced batches and drafts will appear here.", "Các mẻ đã sản xuất và bản nháp sẽ hiện ở đây."),
  },
  transfers: {
    title: T("Перемещения", "Transfers", "Chuyển kho"),
    sub: T("Перемещения продуктов между складами.", "Moving products between locations.", "Chuyển hàng giữa các kho."),
    empty: T("Перемещений ещё не было", "No transfers yet", "Chưa có chuyển kho"),
    text: T("Например, со склада на кухню заготовок или в фудтрак.", "For example, from the warehouse to the prep kitchen or the food truck.", "Ví dụ: từ kho sang bếp sơ chế hoặc xe bán đồ ăn."),
  },
  writeoffs: {
    title: T("Списания", "Write-offs", "Xuất hủy"),
    sub: T("Порча, истёкший срок, пробы — всё, что ушло не в продажу.", "Spoilage, expired stock, tastings — anything not sold.", "Hư hỏng, hết hạn, thử món…"),
    empty: T("Списаний ещё не было", "No write-offs yet", "Chưa có xuất hủy"),
    text: T("Списанные продукты появятся здесь.", "Written-off products appear here.", "Hàng đã xuất hủy sẽ hiện ở đây."),
  },
  counts: {
    title: T("Инвентаризации", "Stock counts", "Kiểm kê"),
    sub: T("Пересчёт продуктов на складе — разница с учётом исправляется автоматически.", "Counting what is on the shelf — differences are corrected automatically.", "Đếm hàng thực tế — chênh lệch sẽ tự điều chỉnh."),
    empty: T("Инвентаризаций ещё не было", "No stock counts yet", "Chưa kiểm kê"),
    text: T("Проведённые инвентаризации появятся здесь.", "Completed stock counts appear here.", "Các lần kiểm kê sẽ hiện ở đây."),
  },
});

export function StockDocsPage({ kind }: { kind: string }) {
  const { state } = useErp();
  const config = STOCK_KINDS[kind];
  const docs = useDocuments(config ? config.types : []);
  if (!state) return null;
  if (!config) {
    return (
      <Empty
        kind="error"
        title={T("Раздел не найден", "Page not found", "Không tìm thấy")}
        action={
          <NavLink href="/erp/stock" className="erpBtn">
            {T("К остаткам", "Back to stock", "Về tồn kho")}
          </NavLink>
        }
      />
    );
  }
  const texts = kindTexts()[kind];
  const add = (
    <NavLink href={config.newHref} className="erpBtn primary">
      {addText()}
    </NavLink>
  );
  return (
    <>
      <PageHead title={texts.title} sub={texts.sub} actions={add} />
      <StockMobileNav active={`/erp/stock/${kind}`} />
      <DocTable state={state} {...docs} showType={kind === "receipts"} empty={<Empty title={texts.empty} text={texts.text} action={add} />} />
    </>
  );
}

export function SuppliersPage() {
  const { state } = useErp();
  if (!state) return null;
  return (
    <>
      <PageHead title={T("Поставщики", "Suppliers", "Nhà cung cấp")} sub={T("У кого вы закупаете продукты.", "Who you buy products from.", "Nơi bạn mua hàng.")} />
      <StockMobileNav active="/erp/stock/suppliers" />
      <RefList<ErpSupplier>
        entity="supplier"
        rows={state.suppliers}
        columns={[
          { key: "name", label: T("Название", "Name", "Tên") },
          { key: "zalo_url", label: T("Ссылка Zalo", "Zalo link", "Liên kết Zalo"), placeholder: "https://zalo.me/…" },
        ]}
        addLabel={T("Добавить поставщика", "Add supplier", "Thêm nhà cung cấp")}
        emptyTitle={T("Поставщиков пока нет", "No suppliers yet", "Chưa có nhà cung cấp")}
        emptyText={T("Добавьте поставщиков, чтобы указывать их в поставках и фасовках.", "Add suppliers to use them in deliveries and packs.", "Thêm nhà cung cấp để dùng khi nhập hàng.")}
      />
    </>
  );
}

const warehouseKinds = (): [string, string][] => [
  ["warehouse", T("Склад", "Warehouse", "Kho")],
  ["prep_kitchen", T("Кухня заготовок", "Prep kitchen", "Bếp sơ chế")],
  ["online_kitchen", T("Онлайн-кухня", "Online kitchen", "Bếp online")],
  ["food_truck", T("Фудтрак", "Food truck", "Xe bán đồ ăn")],
  ["other", T("Другое", "Other", "Khác")],
];

export function WarehousesPage() {
  const { state } = useErp();
  if (!state) return null;
  return (
    <>
      <PageHead
        title={T("Склады", "Locations", "Kho")}
        sub={T("Места, где лежат продукты: основной склад, кухня заготовок, онлайн-кухня, фудтрак.", "Places where products are kept: main warehouse, prep kitchen, online kitchen, food truck.", "Nơi để hàng: kho chính, bếp sơ chế, bếp online, xe bán đồ ăn.")}
      />
      <StockMobileNav active="/erp/stock/warehouses" />
      <RefList<ErpWarehouse>
        entity="warehouse"
        rows={state.warehouses}
        columns={[
          { key: "name", label: T("Название", "Name", "Tên") },
          { key: "kind", label: T("Тип", "Kind", "Loại"), kind: "select", options: warehouseKinds() },
        ]}
        addLabel={T("Добавить склад", "Add location", "Thêm kho")}
        emptyTitle={T("Складов пока нет", "No locations yet", "Chưa có kho")}
        emptyText={T("Добавьте хотя бы один склад, чтобы принимать поставки.", "Add at least one location to receive deliveries.", "Thêm ít nhất một kho để nhập hàng.")}
      />
    </>
  );
}

export function PacksPage() {
  const { state } = useErp();
  const [query, setQuery] = useState("");
  if (!state) return null;
  const products = new Map(state.products.map((p) => [p.id, p]));
  const suppliers = new Map(state.suppliers.map((s) => [s.id, s.name]));
  const all = state.packs
    .map((pack) => ({ pack, product: products.get(pack.product_id) }))
    .filter((entry): entry is { pack: typeof entry.pack; product: NonNullable<typeof entry.product> } => Boolean(entry.product && !entry.product.archived_at))
    .sort((a, b) => a.product.name_en.localeCompare(b.product.name_en) || a.pack.qty_base - b.pack.qty_base);
  const q = query.trim().toLowerCase();
  const rows = all.filter(({ pack, product }) => !q || `${pack.label} ${product.name_en} ${product.name_vn} ${product.brand ?? ""}`.toLowerCase().includes(q));

  return (
    <>
      <PageHead
        title={T("Фасовки", "Packs", "Quy cách")}
        sub={T(
          "В каких упаковках вы покупаете продукты: коробка 5 кг, бутылка 1,8 л, упаковка 10 шт. Поставку можно вводить в фасовках — количество пересчитается само.",
          "The packs you buy products in: a 5 kg box, a 1.8 l bottle, a pack of 10. Deliveries can be entered in packs and converted automatically.",
          "Quy cách mua hàng: thùng 5 kg, chai 1,8 l, gói 10 cái. Có thể nhập hàng theo quy cách.",
        )}
      />
      <StockMobileNav active="/erp/stock/packs" />
      {!all.length ? (
        <Empty
          title={T("Фасовок пока нет", "No packs yet", "Chưa có quy cách")}
          text={T("Фасовка добавляется в карточке продукта, в разделе «Закупка и упаковки».", "Add a pack in the product card, under “Purchasing & packs”.", "Thêm quy cách trong thẻ sản phẩm.")}
          action={
            <NavLink href="/erp/products" className="erpBtn primary">
              {T("К продуктам", "Go to products", "Đến sản phẩm")}
            </NavLink>
          }
        />
      ) : (
        <>
          <div className="erpToolbar">
            <input type="search" placeholder={T("Найти продукт или фасовку…", "Find a product or pack…", "Tìm sản phẩm hoặc quy cách…")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <p className="erpHint">{T("Чтобы изменить или добавить фасовку, откройте продукт.", "To change or add a pack, open the product.", "Để sửa hoặc thêm quy cách, mở sản phẩm.")}</p>
          {!rows.length ? (
            noSearchResults(() => setQuery(""))
          ) : (
            <div className="erpTableWrap">
              <table className="erpTable stack">
                <thead>
                  <tr>
                    <th>{T("Фасовка", "Pack", "Quy cách")}</th>
                    <th className="num">{T("Количество", "Quantity", "Số lượng")}</th>
                    <th>{T("Продукт", "Product", "Sản phẩm")}</th>
                    <th>{T("Поставщик", "Supplier", "Nhà cung cấp")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ pack, product }) => (
                    <tr key={pack.id}>
                      <td className="main">
                        <strong>{pack.label}</strong>
                        {pack.is_default ? <span className="erpBadge">{T("основная", "default", "mặc định")}</span> : null}
                      </td>
                      <td className="num" data-label={T("Количество", "Quantity", "Số lượng")}>
                        {qtyText(pack.qty_base, product.base_unit)}
                      </td>
                      <td data-label={T("Продукт", "Product", "Sản phẩm")}>
                        <NavLink href={`/erp/products/${product.id}`} className="erpName">
                          {productLabel(product)}
                        </NavLink>
                      </td>
                      <td data-label={T("Поставщик", "Supplier", "Nhà cung cấp")}>{pack.supplier_id ? (suppliers.get(pack.supplier_id) ?? "—") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
