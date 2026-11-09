"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, getOrderCatalog } from "@/lib/orders/api";
import {
  ALL_SUPPLIER_TAB,
  catalogCategories,
  clearQuantities,
  defaultPackId,
  filterByCategory,
  filterBySupplierTab,
  filledProductIds,
  groupProductsByCategory,
  productForSupplierTab,
  sortCatalogProducts,
  supplierTabChips,
  type SelectionMap,
} from "@/lib/orders/orderList";
import { readOrderSelection, readOrderSupplierTab, writeOrderSelection, writeOrderSupplierTab } from "@/lib/orders/orderSelection";
import type { OrderProduct, OrderSupplier, OrderWarehouse } from "@/lib/orders/types";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { OrderProductCard } from "./OrderProductCard";
import { useOrders } from "./OrdersShell";
import { SupplierOrderList } from "./SupplierOrderList";

type Props = {
  initialTab?: string;
};

export function OrderList({ initialTab }: Props) {
  const { t, lang } = useOrders();
  const [products, setProducts] = useState<OrderProduct[] | null>(null);
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [warehouses, setWarehouses] = useState<OrderWarehouse[]>([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(initialTab || ALL_SUPPLIER_TAB);
  const [category, setCategory] = useState(ALL_SUPPLIER_TAB);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<SelectionMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const catalog = await getOrderCatalog();
      setProducts(catalog.products);
      setSuppliers(catalog.suppliers);
      setWarehouses(catalog.warehouses);
      setDefaultWarehouseId(catalog.defaultWarehouseId);
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

  const restoredTab = useRef(false);
  useEffect(() => {
    if (initialTab) {
      if (!suppliers.length || suppliers.some((row) => row.id === initialTab)) {
        setTab(initialTab);
        writeOrderSupplierTab(initialTab);
      } else {
        setTab(ALL_SUPPLIER_TAB);
      }
      restoredTab.current = true;
      return;
    }
    if (!suppliers.length || restoredTab.current) return;
    restoredTab.current = true;
    const stored = readOrderSupplierTab();
    if (stored === ALL_SUPPLIER_TAB || suppliers.some((row) => row.id === stored)) setTab(stored);
  }, [initialTab, suppliers]);

  const storeSelection = useCallback((next: SelectionMap) => {
    setSelection(next);
    writeOrderSelection(next);
  }, []);

  const updateSelection = (product: OrderProduct, patch: Partial<{ packId: string | null; qty: string }>) => {
    const current = selection[product.id] ?? { packId: defaultPackId(product), qty: "" };
    storeSelection({ ...selection, [product.id]: { ...current, ...patch } });
  };

  const matchesSearch = useCallback(
    (product: OrderProduct) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      const supplierName = suppliers.find((row) => row.id === product.supplierId)?.name ?? "";
      const packCodes = product.packs.map((item) => item.code ?? "");
      return [
        product.nameEn,
        product.nameVn,
        product.brand ?? "",
        product.itemNo ?? "",
        product.categoryName ?? "",
        product.categoryNameVn ?? "",
        supplierName,
        ...packCodes,
      ].some((text) => text.toLowerCase().includes(query));
    },
    [search, suppliers],
  );

  const sortedProducts = useMemo(() => sortCatalogProducts(products ?? [], lang), [products, lang]);
  const categories = useMemo(() => catalogCategories(sortedProducts, lang), [sortedProducts, lang]);
  const tabs = useMemo(() => supplierTabChips(suppliers, sortedProducts, selection), [suppliers, sortedProducts, selection]);
  const supplier = tab === ALL_SUPPLIER_TAB ? null : (suppliers.find((row) => row.id === tab) ?? null);
  const supplierItems = useMemo(() => {
    const scoped = filterBySupplierTab(sortedProducts, tab).map((product) => productForSupplierTab(product, supplier?.id ?? null));
    return scoped;
  }, [sortedProducts, tab, supplier]);

  const allVisible = useMemo(
    () => filterByCategory(sortedProducts.filter(matchesSearch), category),
    [sortedProducts, matchesSearch, category],
  );
  const allGroups = useMemo(
    () => groupProductsByCategory(allVisible, categories, { locale: lang, uncategorizedName: t("category_none") }),
    [allVisible, categories, lang, t],
  );

  const handleTabChange = (next: string) => {
    setTab(next);
    writeOrderSupplierTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setSearch("");
    setCategory(ALL_SUPPLIER_TAB);
    const scope = supplier ? supplierItems : sortedProducts;
    const filled = filledProductIds(scope, selection);
    if (!filled.length) return;
    const message = supplier ? t("reset_confirm", { supplier: supplier.name }) : t("reset_all_confirm");
    if (!window.confirm(message)) return;
    const next = clearQuantities(selection, filled, (id) => {
      const product = scope.find((row) => row.id === id);
      return product ? defaultPackId(product) : null;
    });
    storeSelection(next);
    if (supplier) setResetNonce((value) => value + 1);
  };

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!products || !hydrated) return <OrdersLoading />;
  if (!products.length) return <OrdersEmpty title={t("catalog_empty")} text={t("catalog_empty_text")} />;

  return (
    <div>
      <div className="orders-supplierTabs" role="tablist" aria-label={t("suppliers_heading")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === ALL_SUPPLIER_TAB}
          className={`orders-supplierTab ${tab === ALL_SUPPLIER_TAB ? "active" : ""}`}
          onClick={() => handleTabChange(ALL_SUPPLIER_TAB)}
        >
          {t("supplier_tab_all")}
        </button>
        {tabs.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={tab === chip.id}
            className={`orders-supplierTab ${tab === chip.id ? "active" : ""} ${chip.count ? "hasMarked" : ""}`}
            onClick={() => handleTabChange(chip.id)}
          >
            {chip.label}
            {chip.count ? <span className="orders-tabCount">{chip.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="orders-searchRow">
        <input className="orders-search" placeholder={t("search_placeholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="orders-btn dark" onClick={handleReset}>
          {t("reset")}
        </button>
      </div>

      {supplier ? (
        <SupplierOrderList
          key={supplier.id}
          supplier={supplier}
          products={supplierItems}
          warehouses={warehouses}
          defaultWarehouseId={defaultWarehouseId}
          selection={selection}
          onSelection={storeSelection}
          search={search}
          resetNonce={resetNonce}
        />
      ) : (
        <>
          <div className="orders-categoryTabs" role="tablist" aria-label={t("filter_all")}>
            <button
              type="button"
              className={`orders-chip ${category === ALL_SUPPLIER_TAB ? "active" : ""}`}
              onClick={() => setCategory(ALL_SUPPLIER_TAB)}
            >
              {t("category_all")}
            </button>
            {categories.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`orders-chip ${category === option.id ? "active" : ""}`}
                onClick={() => setCategory(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>

          <div className="orders-mode">
            <span>{t("catalog_hint")}</span>
            <span>{t("all_items", { count: allVisible.length })}</span>
          </div>

          {allVisible.length ? (
            allGroups.map((group) => (
              <div key={group.id || "uncategorized"}>
                {group.name ? <div className="orders-category">{group.name}</div> : null}
                {group.products.map((product) => {
                  const supplierName = suppliers.find((row) => row.id === product.supplierId)?.name;
                  return (
                    <OrderProductCard
                      key={product.id}
                      product={product}
                      row={selection[product.id]}
                      supplierName={supplierName}
                      showSupplier
                      qtyLabel={t("qty_label")}
                      packLabel={t("pack_label")}
                      onQty={(qty) => updateSelection(product, { qty })}
                      onPack={(packId) => updateSelection(product, { packId })}
                    />
                  );
                })}
              </div>
            ))
          ) : (
            <OrdersEmpty title={t("empty_search")} />
          )}
        </>
      )}
    </div>
  );
}
