"use client";

import { useEffect, useRef } from "react";
import { NavLink, T } from "./ui";

export const stockNavItems = () => [
  { href: "/erp/stock", label: T("Остатки", "Balances", "Tồn kho") },
  { href: "/erp/stock/receipts", label: T("Поставки", "Deliveries", "Nhập hàng") },
  { href: "/erp/purchasing/orders", label: T("Заказы поставщикам", "Supplier orders", "Đơn NCC") },
  { href: "/erp/stock/transfers", label: T("Перемещения", "Transfers", "Chuyển kho") },
  { href: "/erp/stock/writeoffs", label: T("Списания", "Write-offs", "Xuất hủy") },
  { href: "/erp/stock/report", label: T("Отчёт по движению", "Movement report", "Báo cáo biến động") },
  { href: "/erp/stock/counts", label: T("Инвентаризации", "Stock counts", "Kiểm kê") },
  { href: "/erp/stock/suppliers", label: T("Поставщики", "Suppliers", "Nhà cung cấp") },
  { href: "/erp/stock/warehouses", label: T("Склады", "Locations", "Kho") },
  { href: "/erp/stock/packs", label: T("Фасовки", "Packs", "Quy cách") },
];

export function activeStockHref(pathname: string | null): string | null {
  const path = pathname ?? "";
  if (path === "/erp/stock") return "/erp/stock";
  return stockNavItems().find((item) => item.href !== "/erp/stock" && path.startsWith(item.href))?.href ?? null;
}

/** On phones the side menu is hidden, so stock pages show their sections as tabs. */
export function StockMobileNav({ active }: { active: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const link = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !link) return;
    const pad = 16;
    const min = Math.max(0, link.offsetLeft + link.offsetWidth + pad - nav.clientWidth);
    const max = Math.max(0, link.offsetLeft - pad);
    if (nav.scrollLeft < min) nav.scrollLeft = min;
    else if (nav.scrollLeft > max) nav.scrollLeft = max;
  }, [active]);
  return (
    <nav ref={ref} className="erpSubTabs erpMobileOnly">
      {stockNavItems().map((tab) => (
        <NavLink key={tab.href} href={tab.href} className={tab.href === active ? "active" : ""}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
