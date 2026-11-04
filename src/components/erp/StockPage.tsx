"use client";

import { useEffect, useState } from "react";
import { productLabel } from "@/lib/erp/costing";
import type { ErpDocType } from "@/lib/erp/types";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { dateText, Empty, NavLink, noSearchResults, PageHead, qtyText, SubTabs, T, today, typeLabel, unitLabel, vnd } from "./ui";

export const STOCK_KINDS: Record<string, { types: ErpDocType[] | null; newType?: ErpDocType }> = {
  receipts: { types: ["receipt", "opening"], newType: "receipt" },
  transfers: { types: ["transfer"], newType: "transfer" },
  writeoffs: { types: ["writeoff"], newType: "writeoff" },
  counts: { types: ["count"], newType: "count" },
  history: { types: null },
};

export const stockKindOf = (type: ErpDocType) =>
  type === "receipt" || type === "opening" ? "receipts" : type === "transfer" ? "transfers" : type === "writeoff" ? "writeoffs" : type === "count" ? "counts" : "history";

const stockTabs = () => [
  { href: "/erp/stock", label: T("Остатки", "Balances", "Tồn kho") },
  { href: "/erp/stock/receipts", label: T("Поставки", "Deliveries", "Nhập hàng") },
  { href: "/erp/stock/transfers", label: T("Перемещения", "Transfers", "Chuyển kho") },
  { href: "/erp/stock/writeoffs", label: T("Списания", "Write-offs", "Xuất hủy") },
  { href: "/erp/stock/counts", label: T("Инвентаризации", "Stock counts", "Kiểm kê") },
  { href: "/erp/stock/history", label: T("Все документы", "All documents", "Tất cả chứng từ") },
];

const stockSub = () =>
  T(
    "Остатки по складам и все движения продуктов.",
    "Stock by location and every product movement.",
    "Tồn kho theo kho và mọi biến động hàng hóa.",
  );

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
      <PageHead title={T("Склад", "Stock", "Kho")} sub={stockSub()} />
      <StockActions warehouseId={warehouseId || undefined} />
      <SubTabs tabs={stockTabs()} active="/erp/stock" />

      {!active.length ? (
        <Empty
          title={T("Складов пока нет", "No locations yet", "Chưa có kho")}
          text={T("Добавьте склады в служебном разделе: основной склад, кухня заготовок, фудтрак…", "Add locations in the admin area: main warehouse, prep kitchen, food truck…", "Thêm kho trong mục quản trị.")}
          action={
            <NavLink href="/erp/service" className="erpBtn primary">
              {T("Открыть настройки", "Open settings", "Mở cài đặt")}
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

const kindTitles = (): Record<string, { empty: string; text: string; button?: string }> => ({
  receipts: {
    empty: T("Поставок ещё не было", "No deliveries yet", "Chưa có lần nhập hàng"),
    text: T("Принятые поставки и начальные остатки появятся здесь.", "Received deliveries and opening balances appear here.", "Các lần nhập hàng sẽ hiện ở đây."),
    button: T("Принять поставку", "Receive delivery", "Nhận hàng"),
  },
  transfers: {
    empty: T("Перемещений ещё не было", "No transfers yet", "Chưa có chuyển kho"),
    text: T("Перемещения между складами, например со склада на кухню заготовок.", "Moves between locations, e.g. from the warehouse to the prep kitchen.", "Chuyển hàng giữa các kho."),
    button: T("Переместить", "Move", "Chuyển kho"),
  },
  writeoffs: {
    empty: T("Списаний ещё не было", "No write-offs yet", "Chưa có xuất hủy"),
    text: T("Порча, истёкший срок, пробы — всё, что ушло не в продажу.", "Spoilage, expired stock, tastings — anything not sold.", "Hư hỏng, hết hạn, thử món…"),
    button: T("Списать", "Write off", "Xuất hủy"),
  },
  counts: {
    empty: T("Инвентаризаций ещё не было", "No stock counts yet", "Chưa kiểm kê"),
    text: T("Пересчитайте продукты на складе — разница с учётом будет исправлена автоматически.", "Count what is on the shelf — differences are corrected automatically.", "Đếm hàng thực tế — chênh lệch sẽ tự điều chỉnh."),
    button: T("Провести инвентаризацию", "Count stock", "Kiểm kê"),
  },
  history: {
    empty: T("Документов ещё нет", "No documents yet", "Chưa có chứng từ"),
    text: T("Здесь будут все поставки, перемещения, списания, инвентаризации и производство.", "All deliveries, transfers, write-offs, counts and production will be here.", "Tất cả chứng từ sẽ hiện ở đây."),
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
  const titles = kindTitles()[kind];
  return (
    <>
      <PageHead title={T("Склад", "Stock", "Kho")} sub={stockSub()} />
      <StockActions />
      <SubTabs tabs={stockTabs()} active={`/erp/stock/${kind}`} />
      <DocTable
        state={state}
        {...docs}
        showType={kind === "history" || kind === "receipts"}
        empty={
          <Empty
            title={titles.empty}
            text={titles.text}
            action={
              config.newType && titles.button ? (
                <NavLink href={newDocHref(config.newType)} className="erpBtn primary">
                  {titles.button}
                </NavLink>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
