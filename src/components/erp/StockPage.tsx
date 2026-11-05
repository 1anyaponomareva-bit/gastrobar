"use client";

import { useState } from "react";
import { productTitle } from "@/lib/erp/costing";
import type { ErpDocType, ErpSupplier, ErpWarehouse } from "@/lib/erp/types";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { MovementReport } from "./MovementReport";
import { InventoryPage } from "./InventoryPage";
import { ReceiptsPage } from "./ReceiptsPage";
import { RefList } from "./RefList";
import { StockMobileNav } from "./stockNav";
import { Empty, NavLink, noSearchResults, packText, PageHead, qtyText, T } from "./ui";
import { WriteoffsPage } from "./WriteoffsPage";

export const STOCK_KINDS: Record<string, { types: ErpDocType[]; newHref: string }> = {
  receipts: { types: ["receipt", "opening"], newHref: "/erp/documents/new?type=receipt" },
  processing: { types: ["production"], newHref: "/erp/preps/batch/new" },
  transfers: { types: ["transfer"], newHref: "/erp/documents/new?type=transfer" },
  writeoffs: { types: ["writeoff"], newHref: "/erp/documents/new?type=writeoff" },
  counts: { types: ["count"], newHref: "/erp/stock/counts/new" },
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
  if (kind === "receipts") return <ReceiptsPage />;
  if (kind === "writeoffs") return <WriteoffsPage tab="list" />;
  if (kind === "counts") return <InventoryPage />;
  return <StockDocsList kind={kind} />;
}

function StockDocsList({ kind }: { kind: string }) {
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
  const rows = all.filter(({ pack, product }) => !q || `${pack.label} ${packText(pack.label)} ${product.name_en} ${product.name_vn} ${product.brand ?? ""}`.toLowerCase().includes(q));

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
                        <strong className="erpPackName">{packText(pack.label)}</strong>
                        {pack.is_default ? <span className="erpBadge">{T("основная", "default", "mặc định")}</span> : null}
                        {packText(pack.label) !== pack.label ? <small className="erpCellSub">{pack.label}</small> : null}
                      </td>
                      <td className="num" data-label={T("Количество", "Quantity", "Số lượng")}>
                        {qtyText(pack.qty_base, product.base_unit)}
                      </td>
                      <td data-label={T("Продукт", "Product", "Sản phẩm")}>
                        <NavLink href={`/erp/products/${product.id}`} className="erpName">
                          {productTitle(product)}
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
