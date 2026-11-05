"use client";

import type { ReactNode } from "react";
import { DocTable, useDocuments } from "./docs";
import { useErp } from "./ErpShell";
import { reviewCounts } from "./review";
import { StaffImportCard } from "./ServicePages";
import { NavLink, PageHead, T } from "./ui";

function QuickTile({ href, title, text, icon }: { href: string; title: string; text: string; icon: ReactNode }) {
  return (
    <NavLink href={href} className="erpQuickTile">
      <span className="icon" aria-hidden>
        {icon}
      </span>
      <strong>{title}</strong>
      <span>{text}</span>
    </NavLink>
  );
}

const svg = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

export function ErpHome() {
  const { state } = useErp();
  const docs = useDocuments(null, 6);
  if (!state) return null;
  const counts = reviewCounts(state);
  const toCheck = counts.lines + counts.units;
  const emptyCatalog = !state.products.length;

  return (
    <>
      <PageHead title={T("Главная", "Home", "Trang chủ")} sub={T("Что нужно сделать?", "What do you need to do?", "Bạn cần làm gì?")} />

      {emptyCatalog ? <StaffImportCard compact /> : null}

      <div className="erpQuick">
        <QuickTile
          href="/erp/documents/new?type=receipt"
          title={T("Принять поставку", "Receive a delivery", "Nhận hàng")}
          text={T("Товар от поставщика — на склад или сразу на кухню", "Goods from a supplier — to a warehouse or the kitchen", "Hàng từ nhà cung cấp vào kho")}
          icon={svg(<path d="M3 7l9-4 9 4v10l-9 4-9-4V7zM3 7l9 4 9-4M12 11v10" />)}
        />
        <QuickTile
          href="/erp/documents/new?type=transfer"
          title={T("Переместить продукты", "Move products", "Chuyển hàng")}
          text={T("Со склада на кухню заготовок или в фудтрак", "From the warehouse to the prep kitchen or truck", "Từ kho sang bếp sơ chế")}
          icon={svg(<path d="M4 8h13l-3-3M20 16H7l3 3" />)}
        />
        <QuickTile
          href="/erp/preps/batch/new"
          title={T("Изготовить полуфабрикат", "Make a semi-finished product", "Sản xuất bán thành phẩm")}
          text={T("Списать сырьё и получить партию по рецептуре", "Use ingredients and produce a batch", "Trừ nguyên liệu, nhập mẻ thành phẩm")}
          icon={svg(<path d="M5 11h14v3a7 7 0 01-14 0v-3zM8 7c0-1 1-1.5 1-3M12 7c0-1 1-1.5 1-3M16 7c0-1 1-1.5 1-3" />)}
        />
        <QuickTile
          href="/erp/menu"
          title={T("Себестоимость блюда", "Dish cost", "Giá vốn món")}
          text={T("Food Cost, упаковка и маржа по каналам", "Food cost, packaging and margin per channel", "Food cost, bao bì, biên LN")}
          icon={svg(<path d="M7 3v8M5 3v4a2 2 0 004 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 3 3 3v9" />)}
        />
      </div>

      {toCheck ? (
        <div className="erpNotice warn">
          {T("Некоторые данные после загрузки нужно уточнить", "Some imported data needs a quick check", "Một số dữ liệu cần kiểm tra")}
          {counts.units ? ` · ${T("продуктов без единицы", "products without a unit", "sản phẩm chưa có đơn vị")}: ${counts.units}` : ""}
          {counts.lines ? ` · ${T("ингредиентов без привязки", "unlinked ingredients", "nguyên liệu chưa liên kết")}: ${counts.lines}` : ""}{" "}
          <NavLink href="/erp/service/review" className="erpLink">
            {T("Открыть", "Open", "Mở")}
          </NavLink>
        </div>
      ) : null}

      {!emptyCatalog ? (
        <section>
          <h2>{T("Последние документы", "Recent documents", "Chứng từ gần đây")}</h2>
          <DocTable
            state={state}
            documents={docs.documents}
            error={docs.error}
            reload={docs.reload}
            showType
            empty={<p className="erpHint">{T("Документов пока нет — начните с поставки или начальных остатков.", "No documents yet — start with a delivery or opening stock.", "Chưa có chứng từ — bắt đầu bằng nhập hàng.")}</p>}
          />
        </section>
      ) : null}
    </>
  );
}
