"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getDraft, getSuppliers } from "@/lib/orders/api";
import type { OrderSupplier } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { useOrders } from "./OrdersShell";

export function SupplierList() {
  const { t } = useOrders();
  const [suppliers, setSuppliers] = useState<OrderSupplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await getSuppliers();
      const withDrafts = await Promise.all(
        payload.suppliers.map(async (supplier) => {
          if (supplier.draftLineCount) return supplier;
          try {
            const draft = await getDraft(supplier.id);
            return { ...supplier, draftLineCount: draft.lines.filter((line) => line.qty > 0).length };
          } catch {
            return supplier;
          }
        }),
      );
      setSuppliers(withDrafts);
    } catch (err) {
      setSuppliers(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!suppliers) return <OrdersLoading />;
  if (!suppliers.length) return <OrdersEmpty title={t("suppliers_empty")} text={t("suppliers_empty_text")} />;

  return (
    <div>
      {suppliers.map((supplier) => (
        <Link key={supplier.id} href={`/orders/suppliers/${supplier.id}`} className="orders-card orders-supplierBtn">
          <div>
            <div className="orders-name">{supplier.name}</div>
            <div className="orders-meta">
              {supplier.code ? `${supplier.code} · ` : ""}
              {supplier.productCount ? `${supplier.productCount}` : ""}
              {supplier.draftLineCount ? ` · ${t("supplier_draft_count", { count: supplier.draftLineCount })}` : ""}
            </div>
          </div>
          {supplier.draftLineCount ? <span className="orders-count">{supplier.draftLineCount}</span> : null}
        </Link>
      ))}
    </div>
  );
}
