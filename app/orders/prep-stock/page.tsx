"use client";

import dynamic from "next/dynamic";

const PrepStockPage = dynamic(
  () => import("@/components/orders/PrepStockPage").then((mod) => mod.PrepStockPage),
  {
    ssr: false,
    loading: () => <div className="orders-loading">…</div>,
  },
);

export default function OrdersPrepStockRoute() {
  return <PrepStockPage />;
}
