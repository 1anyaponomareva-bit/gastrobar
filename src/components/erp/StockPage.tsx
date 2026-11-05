"use client";

import type { ErpDocType, ErpSupplier, ErpWarehouse } from "@/lib/erp/types";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { MovementReport } from "./MovementReport";
import { InventoryPage } from "./InventoryPage";
import { ReceiptsPage } from "./ReceiptsPage";
import { RefList } from "./RefList";
import { StockMobileNav } from "./stockNav";
import { Empty, NavLink, PageHead, T } from "./ui";
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

export { PacksPage } from "./PacksPage";
