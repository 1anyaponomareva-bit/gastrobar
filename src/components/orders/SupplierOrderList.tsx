"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deliverPdfFile, detectInAppBrowser } from "@/lib/deliverPdfFile";
import { buildDraftPdf, errorMessage, getDraft, getSupplierProducts, getSuppliers, isAuthError, placeOrder, saveDraft } from "@/lib/orders/api";
import { formatOrderLineName, getOrderPdfFileName, type OrderPdfInput } from "@/lib/orders/orderPdf";
import { formatQty, isPositiveQty, lineKey, parseQty } from "@/lib/orders/qty";
import type { OrderDraft, OrderProduct, OrderSupplier, OrderWarehouse } from "@/lib/orders/types";
import { InAppShareNotice } from "./InAppShareNotice";
import { OrdersEmpty, OrdersError, OrdersLoading } from "./LoadState";
import { useOrders } from "./OrdersShell";
import { QtyField } from "./QtyField";

type QtyMap = Record<string, { packId: string | null; qty: string }>;

function defaultPackId(product: OrderProduct): string | null {
  return product.packs.find((pack) => pack.is_default)?.pack_id ?? product.packs[0]?.pack_id ?? null;
}

function packOf(product: OrderProduct, packId: string | null) {
  return product.packs.find((pack) => pack.pack_id === packId) ?? product.packs[0] ?? null;
}

export function SupplierOrderList({ supplierId }: { supplierId: string }) {
  const { t, setEmail } = useOrders();
  const router = useRouter();
  const [supplier, setSupplier] = useState<OrderSupplier | null>(null);
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [products, setProducts] = useState<OrderProduct[] | null>(null);
  const [warehouses, setWarehouses] = useState<OrderWarehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [qtys, setQtys] = useState<QtyMap>({});
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [comment, setComment] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharedRevision, setSharedRevision] = useState<number | null>(null);
  const [orderedRevision, setOrderedRevision] = useState<number | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const qtysRef = useRef(qtys);
  qtysRef.current = qtys;
  const metaRef = useRef({ warehouseId, comment, expectedDelivery });
  metaRef.current = { warehouseId, comment, expectedDelivery };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catalog, saved, all] = await Promise.all([getSupplierProducts(supplierId), getDraft(supplierId), getSuppliers()]);
      const current =
        catalog.supplier ??
        all.suppliers.find((row) => row.id === supplierId) ?? {
          id: supplierId,
          name: supplierId,
          code: "",
          zaloUrl: null,
          productCount: catalog.products.length,
          draftLineCount: 0,
        };
      setSupplier(current);
      setSuppliers(all.suppliers);
      setProducts(catalog.products);
      setWarehouses(all.warehouses);
      setDraft(saved);
      setWarehouseId(saved.warehouseId ?? all.defaultWarehouseId ?? "");
      setComment(saved.comment ?? "");
      setExpectedDelivery(saved.expectedDelivery ?? "");
      setSharedRevision(saved.pdfRevision);
      setOrderedRevision(saved.status === "ordered" || saved.status === "partial" || saved.status === "closed" ? saved.revision : null);
      setPlacedId(saved.status === "draft" ? null : saved.id || null);
      const next: QtyMap = {};
      for (const product of catalog.products) {
        const line = saved.lines.find((row) => row.product_id === product.id);
        next[product.id] = {
          packId: line?.pack_id ?? defaultPackId(product),
          qty: line && line.qty > 0 ? formatQty(line.qty) : "",
        };
      }
      setQtys(next);
    } catch (err) {
      if (isAuthError(err)) {
        setEmail(null);
        return;
      }
      setProducts(null);
      setError(errorMessage(err, t("error_network"), t("error_load")));
    }
  }, [setEmail, supplierId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const linesFromQtys = useCallback(() => {
    return Object.entries(qtysRef.current)
      .filter(([, row]) => isPositiveQty(row.qty))
      .map(([productId, row]) => ({ product_id: productId, pack_id: row.packId, qty: parseQty(row.qty) }));
  }, []);

  const persist = useCallback(
    async (nextQtys?: QtyMap) => {
      if (nextQtys) qtysRef.current = nextQtys;
      setSaveState("saving");
      setSaveError(null);
      try {
        const meta = metaRef.current;
        const saved = await saveDraft(supplierId, {
          warehouseId: meta.warehouseId || null,
          comment: meta.comment.trim() || null,
          expectedDelivery: meta.expectedDelivery || null,
          lines: linesFromQtys(),
        });
        setDraft(saved);
        setSaveState("saved");
        return saved;
      } catch (err) {
        if (isAuthError(err)) {
          setEmail(null);
          return null;
        }
        setSaveState("error");
        setSaveError(errorMessage(err, t("error_network"), t("error_save")));
        return null;
      }
    },
    [linesFromQtys, setEmail, supplierId, t],
  );

  const scheduleSave = useCallback(
    (next: QtyMap) => {
      setQtys(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next);
      }, 650);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const marked = useMemo(
    () => (products ?? []).filter((product) => isPositiveQty(qtys[product.id]?.qty)),
    [products, qtys],
  );

  const pdfInput = useMemo((): OrderPdfInput | null => {
    if (!supplier || !marked.length) return null;
    return {
      orderNo: draft?.orderNo || draft?.id || t("draft_label"),
      revision: draft?.revision || 0,
      orderedAt: (draft?.placedAt || new Date().toISOString()).slice(0, 10),
      supplierName: supplier.name,
      warehouseName: warehouses.find((row) => row.id === warehouseId)?.name,
      comment: comment || undefined,
      lines: marked.map((product) => {
        const row = qtys[product.id];
        const pack = packOf(product, row?.packId ?? null);
        return {
          nameEn: product.nameEn,
          nameVn: product.nameVn,
          brand: product.brand ?? "",
          packLabel: pack?.label ?? "",
          unit: pack?.unit || product.unit,
          qty: parseQty(row?.qty),
        };
      }),
    };
  }, [comment, draft, marked, qtys, supplier, t, warehouseId, warehouses]);

  const currentRevision = draft?.revision ?? 0;
  const pdfStale = sharedRevision != null && currentRevision !== sharedRevision;
  const orderedThisRevision = orderedRevision != null && orderedRevision === currentRevision && !pdfStale;
  const orderNo = draft?.orderNo || draft?.id || "";

  const matchesSearch = useCallback(
    (product: OrderProduct) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      const packCodes = product.packs.map((item) => item.code ?? "");
      return [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? "", supplier?.name ?? "", ...packCodes].some((text) =>
        text.toLowerCase().includes(query),
      );
    },
    [search, supplier],
  );

  const filtered = (products ?? []).filter(matchesSearch);
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products ?? []) {
      if (product.categoryId) map.set(product.categoryId, product.categoryName ?? product.categoryId);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

  const setQty = (product: OrderProduct, qty: string) => {
    const current = qtys[product.id] ?? { packId: defaultPackId(product), qty: "" };
    scheduleSave({ ...qtys, [product.id]: { ...current, qty } });
  };

  const setPack = (product: OrderProduct, packId: string) => {
    const current = qtys[product.id] ?? { packId, qty: "" };
    scheduleSave({ ...qtys, [product.id]: { ...current, packId } });
  };

  const handleReset = () => {
    if (!marked.length) {
      setSearch("");
      return;
    }
    if (!window.confirm(t("reset_confirm", { supplier: supplier?.name ?? "" }))) return;
    const cleared: QtyMap = {};
    for (const product of products ?? []) {
      cleared[product.id] = { packId: qtys[product.id]?.packId ?? defaultPackId(product), qty: "" };
    }
    setSearch("");
    scheduleSave(cleared);
  };

  const handlePdf = async () => {
    if (pdfBusy || !marked.length) return;
    if (detectInAppBrowser()) {
      window.alert(t("inapp_blocked"));
      return;
    }
    setActionError(null);
    setPdfBusy(true);
    try {
      const saved = await persist();
      if (!saved?.id) return;
      const pdf = await buildDraftPdf(saved.id, pdfInput ?? undefined);
      if (!pdf.blob) {
        setActionError(t("error_pdf"));
        return;
      }
      setDraft((prev) =>
        prev
          ? { ...prev, id: saved.id, orderNo: saved.orderNo, revision: pdf.revision || saved.revision, pdfRevision: pdf.revision || saved.pdfRevision }
          : prev,
      );
      const delivered = await deliverPdfFile(
        pdf.blob,
        getOrderPdfFileName({
          orderNo: saved.orderNo || saved.id,
          revision: pdf.revision || saved.revision || 1,
          orderedAt: saved.placedAt || new Date().toISOString(),
          supplierName: supplier?.name ?? "",
        }),
      );
      if (delivered !== "shared" && delivered !== "cancelled" && delivered !== "downloaded") {
        setActionError(t("error_pdf"));
        return;
      }
      setSharedRevision(pdf.revision || saved.revision);
    } catch (err) {
      setActionError(errorMessage(err, t("error_network"), t("error_pdf")));
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePlace = async () => {
    if (placeBusy || orderedThisRevision) return;
    if (!marked.length) {
      setActionError(t("place_need_lines"));
      return;
    }
    const saved = await persist();
    if (!saved) return;
    const no = saved.orderNo || saved.id;
    if (!no) {
      setActionError(t("place_need_draft"));
      return;
    }
    if (!window.confirm(t("place_confirm", { supplier: supplier?.name ?? "", orderNo: no, revision: saved.revision || 1 }))) return;
    setActionError(null);
    setPlaceBusy(true);
    try {
      const placed = await placeOrder(saved.id || supplierId, { comment: saved.comment, expectedDelivery: saved.expectedDelivery });
      setDraft((prev) =>
        prev
          ? { ...prev, id: placed.id, orderNo: placed.docNo || prev.orderNo, status: placed.status, revision: placed.revision || prev.revision, placedAt: placed.placedAt }
          : prev,
      );
      setOrderedRevision(placed.revision || saved.revision);
      setPlacedId(placed.id);
    } catch (err) {
      if (isAuthError(err)) {
        setEmail(null);
        return;
      }
      setActionError(errorMessage(err, t("error_network"), t("error_place")));
    } finally {
      setPlaceBusy(false);
    }
  };

  if (error) return <OrdersError text={error} onRetry={() => void load()} />;
  if (!products || !supplier) return <OrdersLoading />;

  const renderCard = (product: OrderProduct) => {
    const row = qtys[product.id] ?? { packId: defaultPackId(product), qty: "" };
    const markedLine = isPositiveQty(row.qty);
    const pack = packOf(product, row.packId);
    const details = [product.brand].filter(Boolean);
    return (
      <div key={lineKey(product.id, row.packId)} className={`orders-card ${markedLine ? "marked" : ""}`}>
        <div className="orders-name">{formatOrderLineName({ nameEn: product.nameEn, nameVn: product.nameVn })}</div>
        {details.length ? <div className="orders-meta">{details.join(" · ")}</div> : null}
        {product.packs.length > 1 ? (
          <div className="orders-field" style={{ margin: "8px 0" }}>
            <label>{t("pack_label")}</label>
            <select className="orders-select" value={row.packId ?? ""} onChange={(event) => setPack(product, event.target.value)}>
              {product.packs.map((item) => (
                <option key={item.pack_id} value={item.pack_id}>
                  {item.code ? `${item.label} · ${item.code}` : item.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <QtyField label={t("qty_label")} unit={pack?.unit || product.unit} value={row.qty} onChange={(value) => setQty(product, value)} />
        {pack ? <div className="orders-packHint">{t("pack_hint", { pack: pack.label })}</div> : null}
      </div>
    );
  };

  return (
    <div>
      <Link href="/orders" className="orders-back">
        ← {t("order_list")}
      </Link>

      {suppliers.length > 1 ? (
        <div className="orders-chipRow">
          {suppliers.map((row) => {
            const count = row.id === supplier.id ? marked.length : row.draftLineCount;
            return (
              <button
                key={row.id}
                type="button"
                className={`orders-chip ${row.id === supplier.id ? "active" : ""} ${count ? "hasMarked" : ""}`}
                onClick={() => {
                  if (row.id !== supplier.id) router.push(`/orders/suppliers/${row.id}`);
                }}
              >
                {row.name}
                {count ? <span className="orders-count">{count}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <h2 className="orders-name" style={{ margin: "0 0 6px" }}>
        {supplier.name}
      </h2>
      <div className="orders-mode">
        <span>{orderNo ? t("order_meta", { orderNo, revision: currentRevision || 1 }) : t("draft_label")}</span>
        <span>{t("chosen_count", { supplier: supplier.name, marked: marked.length, count: products.length })}</span>
      </div>

      <InAppShareNotice />

      <div className="orders-card">
        <div className="orders-row" style={{ marginBottom: 8 }}>
          <div className="orders-field">
            <label>{t("warehouse")}</label>
            <select
              className="orders-select"
              value={warehouseId}
              onChange={(event) => {
                const value = event.target.value;
                metaRef.current = { ...metaRef.current, warehouseId: value };
                setWarehouseId(value);
              }}
              onBlur={() => void persist()}
            >
              {warehouses.length ? (
                warehouses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))
              ) : (
                <option value="">{t("warehouse")}</option>
              )}
            </select>
          </div>
          <div className="orders-field">
            <label>{t("expected_delivery")}</label>
            <input
              className="orders-input"
              type="date"
              value={expectedDelivery}
              onChange={(event) => {
                const value = event.target.value;
                metaRef.current = { ...metaRef.current, expectedDelivery: value };
                setExpectedDelivery(value);
              }}
              onBlur={() => void persist()}
            />
          </div>
        </div>
        <div className="orders-field">
          <label>{t("comment")}</label>
          <textarea
            className="orders-textarea"
            value={comment}
            placeholder={t("comment_placeholder")}
            onChange={(event) => {
              const value = event.target.value;
              metaRef.current = { ...metaRef.current, comment: value };
              setComment(value);
            }}
            onBlur={() => void persist()}
          />
        </div>
        <div className="orders-mode">
          <span>{saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : saveState === "error" ? t("save_failed") : ""}</span>
        </div>
      </div>

      {saveError ? (
        <div className="orders-banner error" role="alert">
          {saveError}
        </div>
      ) : null}
      {actionError ? (
        <div className="orders-banner error" role="alert">
          {actionError}
        </div>
      ) : null}
      {pdfStale ? (
        <div className="orders-banner warn">
          {t("pdf_stale", { previous: sharedRevision ?? 0, current: currentRevision || 1 })}
        </div>
      ) : null}
      {orderedThisRevision ? (
        <div className="orders-banner ok">
          {t("placed_banner", { orderNo: orderNo || placedId || "", revision: orderedRevision ?? currentRevision })}
          {placedId ? (
            <>
              {" · "}
              <Link href={`/orders/${placedId}`} className="orders-link">
                {t("open_placed")}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="orders-searchRow">
        <input className="orders-search" placeholder={t("search_placeholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="orders-btn dark" onClick={handleReset}>
          {t("reset")}
        </button>
      </div>

      {marked.length ? (
        <div className="orders-card">
          <div className="orders-category" style={{ marginTop: 0 }}>
            {t("chosen_title")}
          </div>
          {marked.map((product) => {
            const row = qtys[product.id];
            const pack = packOf(product, row?.packId ?? null);
            return (
              <div key={`chosen-${product.id}`} style={{ padding: "8px 0", borderBottom: "1px solid var(--orders-line)" }}>
                <div className="orders-name" style={{ fontSize: 16, margin: 0 }}>
                  {formatOrderLineName({ nameEn: product.nameEn, nameVn: product.nameVn })}
                </div>
                <div className="orders-meta">
                  {pack?.label ? `${pack.label} · ` : ""}
                  {row?.qty} {pack?.unit || product.unit}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="orders-note">{t("chosen_empty")}</p>
      )}

      {filtered.length ? (
        categories.length ? (
          <>
            {categories.map((category) => {
              const items = filtered.filter((product) => product.categoryId === category.id);
              if (!items.length) return null;
              return (
                <div key={category.id}>
                  <div className="orders-category">{category.name}</div>
                  {items.map(renderCard)}
                </div>
              );
            })}
            {filtered.some((product) => !product.categoryId) ? (
              <div>
                <div className="orders-category">{supplier.name}</div>
                {filtered.filter((product) => !product.categoryId).map(renderCard)}
              </div>
            ) : null}
          </>
        ) : (
          filtered.map(renderCard)
        )
      ) : products.length ? (
        <OrdersEmpty title={t("empty_search")} />
      ) : (
        <OrdersEmpty title={t("empty_products")} />
      )}

      <div className="orders-stickyActions">
        <div className="orders-actions">
          <button type="button" className="orders-btn primary block" onClick={() => void handlePdf()} disabled={pdfBusy || !marked.length}>
            {pdfBusy ? t("pdf_sharing") : t("pdf_share")}
            {currentRevision ? ` · ${t("pdf_revision", { revision: currentRevision })}` : ""}
          </button>
          <button
            type="button"
            className="orders-btn ok block"
            onClick={() => void handlePlace()}
            disabled={placeBusy || !marked.length || saveState === "saving" || orderedThisRevision}
          >
            {placeBusy ? t("placing") : t("place_order")}
          </button>
        </div>
      </div>
    </div>
  );
}
