"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, getOrderCatalog } from "@/lib/orders/api";
import { formatOrderLineName } from "@/lib/orders/orderPdf";
import {
  defaultPackId,
  isProductMarked,
  packOf,
  sortCatalogProducts,
  supplierBadgeCounts,
  type SelectionMap,
} from "@/lib/orders/orderList";
import { readOrderSelection, setSelectionRow, writeOrderSelection } from "@/lib/orders/orderSelection";
import type { OrderProduct, OrderSupplier } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { useOrders } from "./OrdersShell";
import { QtyField } from "./QtyField";

export function OrderList() {
  const { t } = useOrders();
  const [products, setProducts] = useState<OrderProduct[] | null>(null);
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<SelectionMap>({});
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const catalog = await getOrderCatalog();
      setProducts(sortCatalogProducts(catalog.products.map((row) => ({ ...row, sort: row.sort ?? 0 }))));
      setSuppliers(catalog.suppliers);
    } catch (err) {
      setProducts(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelection(readOrderSelection());
    setHydrated(true);
  }, []);

  const updateSelection = (product: OrderProduct, patch: Partial<{ packId: string | null; qty: string }>) => {
    const current = selection[product.id] ?? { packId: defaultPackId(product), qty: "" };
    const next = setSelectionRow(selection, product.id, { ...current, ...patch });
    setSelection(next);
    writeOrderSelection(next);
  };

  const matchesSearch = useCallback(
    (product: OrderProduct) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      const supplierName = suppliers.find((row) => row.id === product.supplierId)?.name ?? "";
      const packCodes = product.packs.map((item) => item.code ?? "");
      return [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? "", supplierName, ...packCodes].some((text) =>
        text.toLowerCase().includes(query),
      );
    },
    [search, suppliers],
  );

  const visible = useMemo(() => (products ?? []).filter(matchesSearch), [products, matchesSearch]);
  const badges = useMemo(() => supplierBadgeCounts(products ?? [], selection), [products, selection]);

  const handleReset = () => {
    if (!Object.values(selection).some((row) => row.qty.trim())) {
      setSearch("");
      return;
    }
    if (!window.confirm(t("reset_all_confirm"))) return;
    setSearch("");
    setSelection({});
    writeOrderSelection({});
  };

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!products || !hydrated) return <OrdersLoading />;
  if (!products.length) return <OrdersEmpty title={t("catalog_empty")} text={t("catalog_empty_text")} />;

  return (
    <div>
      <div className="orders-searchRow">
        <input className="orders-search" placeholder={t("search_placeholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="orders-btn dark" onClick={handleReset}>
          {t("reset")}
        </button>
      </div>
      <div className="orders-mode">
        <span>{t("catalog_count", { count: visible.length })}</span>
      </div>

      {visible.length ? (
        visible.map((product) => {
          const row = selection[product.id] ?? { packId: defaultPackId(product), qty: "" };
          const marked = isProductMarked(product.id, selection);
          const pack = packOf(product, row.packId);
          const supplierName = suppliers.find((item) => item.id === product.supplierId)?.name;
          const details = [product.brand, supplierName, product.itemNo ? `#${product.itemNo}` : null].filter(Boolean);
          return (
            <div key={product.id} className={`orders-card ${marked ? "marked" : ""}`}>
              <div className="orders-name">{formatOrderLineName({ nameEn: product.nameEn, nameVn: product.nameVn })}</div>
              {details.length ? <div className="orders-meta">{details.join(" · ")}</div> : null}
              <QtyField
                label={t("qty_label")}
                unit={pack?.unit || product.unit}
                value={row.qty}
                onChange={(qty) => updateSelection(product, { qty })}
              />
              {pack ? <div className="orders-packHint">{pack.code ? `${pack.label} · ${pack.code}` : pack.label}</div> : null}
            </div>
          );
        })
      ) : (
        <OrdersEmpty title={t("empty_search")} />
      )}

      <h3 className="orders-category">{t("suppliers_heading")}</h3>
      {suppliers.length ? (
        suppliers.map((supplier) => {
          const count = badges.get(supplier.id) ?? 0;
          return (
            <Link
              key={supplier.id}
              href={`/orders/suppliers/${supplier.id}`}
              className={`orders-card orders-supplierBtn ${count ? "hasMarked" : ""}`}
            >
              <div>
                <div className="orders-name">{supplier.name}</div>
                <div className="orders-meta">{supplier.code || ""}</div>
              </div>
              {count ? <span className="orders-count">{count}</span> : null}
            </Link>
          );
        })
      ) : (
        <OrdersEmpty title={t("suppliers_empty")} text={t("suppliers_empty_text")} />
      )}
    </div>
  );
}
