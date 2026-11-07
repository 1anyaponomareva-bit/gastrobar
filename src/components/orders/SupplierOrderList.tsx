"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deliverPdfFile, detectInAppBrowser } from "@/lib/deliverPdfFile";
import { errorMessage, freezeDraftPdf, getDraft, placeOrder, saveDraft } from "@/lib/orders/api";
import {
  catalogCategories,
  clearSupplierSelection,
  defaultPackId,
  groupProductsByCategory,
  isProductMarked,
  reducePlaceDialog,
  selectionDraftLines,
  shouldPlaceAfterDialog,
  supplierPrintPdfInput,
  type PlaceDialogPhase,
  type SelectionMap,
} from "@/lib/orders/orderList";
import { getOrderPdfFileName, makeOrderPdfBlob, preloadOrderPdfFonts } from "@/lib/orders/orderPdf";
import { readOrderSelection } from "@/lib/orders/orderSelection";
import { formatQty } from "@/lib/orders/qty";
import type { OrderDraft, OrderProduct, OrderSupplier, OrderWarehouse } from "@/lib/orders/types";
import { InAppShareNotice } from "./InAppShareNotice";
import { OrdersEmpty } from "./LoadState";
import { OrderProductCard } from "./OrderProductCard";
import { useOrders } from "./OrdersShell";
import { PlaceOrderDialog } from "./PlaceOrderDialog";

type Props = {
  supplier: OrderSupplier;
  products: OrderProduct[];
  warehouses: OrderWarehouse[];
  defaultWarehouseId: string | null;
  selection: SelectionMap;
  onSelection: (next: SelectionMap) => void;
  search: string;
  resetNonce: number;
};

export function SupplierOrderList({
  supplier,
  products,
  warehouses,
  defaultWarehouseId,
  selection,
  onSelection,
  search,
  resetNonce,
}: Props) {
  const { t } = useOrders();
  const router = useRouter();
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? "");
  const [comment, setComment] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [placePhase, setPlacePhase] = useState<PlaceDialogPhase>("closed");
  const [sharedRevision, setSharedRevision] = useState<number | null>(null);
  const [orderedRevision, setOrderedRevision] = useState<number | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  const mergedDraft = useRef(false);
  const preparedPdf = useRef<{ key: string; promise: Promise<Blob> } | null>(null);

  const persist = useCallback(
    async (nextSelection?: SelectionMap) => {
      if (nextSelection) selectionRef.current = nextSelection;
      setSaveState("saving");
      try {
        const saved = await saveDraft(supplier.id, {
          warehouseId: warehouseId || null,
          comment: comment.trim() || null,
          expectedDelivery: expectedDelivery || null,
          lines: selectionDraftLines(products, selectionRef.current),
        });
        setDraft(saved);
        setSaveState("saved");
        return saved;
      } catch (err) {
        setSaveState("error");
        setActionError(errorMessage(err, t("error_network"), t("error_save")));
        return null;
      }
    },
    [comment, expectedDelivery, products, supplier.id, t, warehouseId],
  );

  const scheduleSave = useCallback(
    (next: SelectionMap) => {
      onSelectionRef.current(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next);
      }, 650);
    },
    [persist],
  );

  useEffect(() => {
    mergedDraft.current = false;
    let cancelled = false;
    void getDraft(supplier.id)
      .then((saved) => {
        if (cancelled) return;
        setDraft(saved);
        setWarehouseId(saved.warehouseId ?? defaultWarehouseId ?? "");
        setComment(saved.comment ?? "");
        setExpectedDelivery(saved.expectedDelivery ?? "");
        setSharedRevision(saved.pdfRevision);
        setOrderedRevision(saved.status === "ordered" || saved.status === "partial" || saved.status === "closed" ? saved.revision : null);
        setPlacedId(saved.status === "draft" ? null : saved.id || null);
        const stored = readOrderSelection();
        const next: SelectionMap = { ...stored };
        for (const product of products) {
          const local = stored[product.id];
          const line = saved.lines.find((row) => row.product_id === product.id);
          next[product.id] = {
            packId: local?.packId ?? line?.pack_id ?? defaultPackId(product),
            qty: local?.qty || (line && line.qty > 0 ? formatQty(line.qty) : ""),
          };
        }
        mergedDraft.current = true;
        onSelectionRef.current(next);
      })
      .catch((err) => {
        if (!cancelled) setActionError(errorMessage(err, t("error_network"), t("error_load")));
      });
    return () => {
      cancelled = true;
    };
  }, [defaultWarehouseId, products, supplier.id, t]);

  useEffect(() => {
    if (!resetNonce || !mergedDraft.current) return;
    void persist(selectionRef.current);
  }, [persist, resetNonce]);

  useEffect(() => {
    preloadOrderPdfFonts();
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const marked = useMemo(() => products.filter((product) => isProductMarked(product.id, selection)), [products, selection]);

  const pdfInput = useMemo(
    () =>
      supplierPrintPdfInput(products, selection, {
        orderNo: draft?.orderNo || draft?.id || t("draft_label"),
        supplierName: supplier.name,
        orderedAt: draft?.placedAt || new Date().toISOString(),
        warehouseName: warehouses.find((row) => row.id === warehouseId)?.name,
        comment: comment || undefined,
      }),
    [comment, draft, products, selection, supplier.name, t, warehouseId, warehouses],
  );
  const pdfKey = pdfInput ? JSON.stringify(pdfInput) : "";

  useEffect(() => {
    if (!pdfInput) {
      preparedPdf.current = null;
      return;
    }
    preparedPdf.current = { key: pdfKey, promise: makeOrderPdfBlob(pdfInput) };
  }, [pdfInput, pdfKey]);

  const currentRevision = draft?.revision ?? 0;
  const pdfStale = sharedRevision != null && currentRevision !== sharedRevision;
  const orderedThisRevision = orderedRevision != null && orderedRevision === currentRevision && !pdfStale;
  const orderNo = draft?.orderNo || draft?.id || "";

  const matchesSearch = useCallback(
    (product: OrderProduct) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      const packCodes = product.packs.map((item) => item.code ?? "");
      return [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? "", product.productCode ?? "", product.categoryName ?? "", supplier.name, ...packCodes].some(
        (text) => text.toLowerCase().includes(query),
      );
    },
    [search, supplier.name],
  );

  const visible = products.filter(matchesSearch);
  const groups = groupProductsByCategory(visible, catalogCategories(products));

  const setQty = (product: OrderProduct, qty: string) => {
    const current = selection[product.id] ?? { packId: defaultPackId(product), qty: "" };
    scheduleSave({ ...selection, [product.id]: { ...current, qty } });
  };

  const setPack = (product: OrderProduct, packId: string) => {
    const current = selection[product.id] ?? { packId, qty: "" };
    scheduleSave({ ...selection, [product.id]: { ...current, packId } });
  };

  const handlePdf = async () => {
    if (pdfBusy) return;
    if (!pdfInput || !marked.length) {
      setActionError(t("place_need_lines"));
      return;
    }
    if (detectInAppBrowser()) {
      window.alert(t("inapp_blocked"));
      return;
    }
    setActionError(null);
    setPdfBusy(true);
    try {
      const prepared = preparedPdf.current;
      const blob =
        prepared?.key === pdfKey ? await prepared.promise : await makeOrderPdfBlob(pdfInput);
      const delivered = await deliverPdfFile(
        blob,
        getOrderPdfFileName({
          orderedAt: pdfInput.orderedAt,
          supplierName: supplier.name,
        }),
      );
      if (delivered !== "shared" && delivered !== "cancelled" && delivered !== "downloaded") {
        setActionError(t("error_pdf"));
        return;
      }
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      void persist()
        .then((saved) => (saved?.id ? freezeDraftPdf(supplier.id) : null))
        .catch(() => null);
    } catch (err) {
      setActionError(errorMessage(err, t("error_network"), t("error_pdf")));
    } finally {
      setPdfBusy(false);
    }
  };

  const openPlaceDialog = () => {
    if (placeBusy || orderedThisRevision) return;
    if (!marked.length) {
      setActionError(t("place_need_lines"));
      return;
    }
    setDialogError(null);
    setPlacePhase(reducePlaceDialog(placePhase, "open"));
  };

  const submitPlace = async () => {
    const nextPhase = reducePlaceDialog(placePhase, "submit");
    if (!shouldPlaceAfterDialog(nextPhase)) return;
    if (!warehouseId) {
      setDialogError(t("warehouse_required"));
      return;
    }
    setPlacePhase(nextPhase);
    setDialogError(null);
    setActionError(null);
    setPlaceBusy(true);
    try {
      const saved = await saveDraft(supplier.id, {
        warehouseId,
        comment: comment.trim() || null,
        expectedDelivery: expectedDelivery || null,
        lines: selectionDraftLines(products, selectionRef.current),
      });
      setDraft(saved);
      if (!saved?.id) {
        setPlacePhase("open");
        setDialogError(t("place_need_draft"));
        return;
      }
      const placed = await placeOrder(saved.id, { comment: saved.comment, expectedDelivery: saved.expectedDelivery });
      onSelectionRef.current(clearSupplierSelection(selectionRef.current, products.map((product) => product.id)));
      setPlacedId(placed.id);
      setOrderedRevision(placed.revision || saved.revision);
      router.push(`/orders/${placed.id}`);
    } catch (err) {
      setPlacePhase("open");
      setDialogError(errorMessage(err, t("error_network"), t("error_place")));
    } finally {
      setPlaceBusy(false);
    }
  };

  return (
    <div>
      <div className="orders-mode">
        <span>{orderNo || t("draft_label")}</span>
        <span>{t("chosen_count", { supplier: supplier.name, marked: marked.length, count: products.length })}</span>
      </div>

      <InAppShareNotice />

      {saveState === "error" ? (
        <div className="orders-banner error" role="alert">
          {t("save_failed")}
        </div>
      ) : null}
      {actionError ? (
        <div className="orders-banner error" role="alert">
          {actionError}
        </div>
      ) : null}
      {orderedThisRevision ? (
        <div className="orders-banner ok">
          {t("placed_banner", { orderNo: orderNo || placedId || "" })}
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

      {visible.length ? (
        groups.map((group) => (
          <div key={group.id || "uncategorized"}>
            {group.name ? <div className="orders-category">{group.name}</div> : null}
            {group.products.map((product) => (
              <OrderProductCard
                key={product.id}
                product={product}
                row={selection[product.id]}
                showSupplier={false}
                qtyLabel={t("qty_label")}
                packLabel={t("pack_label")}
                onQty={(qty) => setQty(product, qty)}
                onPack={(packId) => setPack(product, packId)}
              />
            ))}
          </div>
        ))
      ) : products.length ? (
        <OrdersEmpty title={t("empty_search")} />
      ) : (
        <OrdersEmpty title={t("empty_products")} />
      )}

      <div className="orders-stickyActions">
        <div className="orders-actions">
          <button type="button" className="orders-btn primary block" onClick={() => void handlePdf()} disabled={pdfBusy}>
            {pdfBusy ? t("pdf_sharing") : t("pdf_print")}
          </button>
          <button
            type="button"
            className="orders-btn ok block"
            onClick={openPlaceDialog}
            disabled={placeBusy || !marked.length || saveState === "saving" || orderedThisRevision}
          >
            {placeBusy ? t("placing") : t("place_order")}
          </button>
        </div>
      </div>

      <PlaceOrderDialog
        open={placePhase === "open"}
        warehouses={warehouses}
        warehouseId={warehouseId}
        expectedDelivery={expectedDelivery}
        comment={comment}
        busy={placeBusy}
        error={dialogError}
        onWarehouse={setWarehouseId}
        onExpectedDelivery={setExpectedDelivery}
        onComment={setComment}
        onCancel={() => setPlacePhase(reducePlaceDialog(placePhase, "cancel"))}
        onSubmit={() => void submitPlace()}
      />
    </div>
  );
}
