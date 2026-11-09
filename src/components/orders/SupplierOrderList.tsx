"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { beginShareThenPersist, deliverPdfFile, detectInAppBrowser } from "@/lib/deliverPdfFile";
import { errorMessage, freezeDraftPdf, getDraft, placeOrder, saveDraft } from "@/lib/orders/api";
import {
  ALL_CATEGORY_TAB,
  clearSupplierSelection,
  defaultPackId,
  filterByCategory,
  isProductMarked,
  orderPdfWarehouseFields,
  orderPdfWarehouseOf,
  reducePlaceDialog,
  selectionDraftLines,
  shouldPlaceAfterDialog,
  supplierPrintPdfInput,
  type PlaceDialogPhase,
  type SelectionMap,
} from "@/lib/orders/orderList";
import {
  getOrderPdfFileName,
  makeOrderPdfBlob,
  orderPdfTitle,
  preloadOrderPdfFonts,
  type OrderPdfInput,
} from "@/lib/orders/orderPdf";
import { readOrderSelection } from "@/lib/orders/orderSelection";
import { formatQty } from "@/lib/orders/qty";
import type { OrderDraft, OrderProduct, OrderSupplier, OrderWarehouse } from "@/lib/orders/types";
import { InAppShareNotice } from "./InAppShareNotice";
import { OrdersEmpty } from "./LoadState";
import { OrderProductCard } from "./OrderProductCard";
import { useOrders } from "./OrdersShell";
import { PlaceOrderDialog } from "./PlaceOrderDialog";

type PreparedPdf = { key: string; blob: Blob | null; promise: Promise<Blob> };

type Props = {
  supplier: OrderSupplier;
  products: OrderProduct[];
  warehouses: OrderWarehouse[];
  defaultWarehouseId: string | null;
  selection: SelectionMap;
  onSelection: (next: SelectionMap) => void;
  search: string;
  category?: string;
  resetNonce: number;
};

function primePreparedPdf(ref: { current: PreparedPdf | null }, key: string, input: OrderPdfInput | null) {
  if (!input) {
    ref.current = null;
    return;
  }
  const promise = makeOrderPdfBlob(input).then((blob) => {
    if (ref.current?.key === key) ref.current.blob = blob;
    return blob;
  });
  ref.current = { key, blob: null, promise };
}

function takePdfBlob(ref: { current: PreparedPdf | null }, key: string, input: OrderPdfInput): Blob | Promise<Blob> {
  const prepared = ref.current;
  if (prepared?.key === key && prepared.blob) return prepared.blob;
  if (prepared?.key === key) return prepared.promise;
  return makeOrderPdfBlob(input);
}

export function SupplierOrderList({
  supplier,
  products,
  warehouses,
  defaultWarehouseId,
  selection,
  onSelection,
  search,
  category = ALL_CATEGORY_TAB,
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
  const persistGen = useRef(0);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  const mergedDraft = useRef(false);
  const preparedPdf = useRef<PreparedPdf | null>(null);
  const preparedFinalPdf = useRef<PreparedPdf | null>(null);
  const pdfInFlight = useRef(false);
  const placeInFlight = useRef(false);

  const persist = useCallback(
    async (nextSelection?: SelectionMap) => {
      if (nextSelection) selectionRef.current = nextSelection;
      const gen = ++persistGen.current;
      setSaveState("saving");
      try {
        const saved = await saveDraft(supplier.id, {
          warehouseId: warehouseId || null,
          comment: comment.trim() || null,
          expectedDelivery: expectedDelivery || null,
          lines: selectionDraftLines(products, selectionRef.current),
        });
        if (gen !== persistGen.current) return saved;
        setDraft(saved);
        setSaveState("saved");
        setActionError(null);
        return saved;
      } catch (err) {
        if (gen !== persistGen.current) return null;
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
        setOrderedRevision(
          saved.status === "ordered" || saved.status === "partial" || saved.status === "received" || saved.status === "closed"
            ? saved.revision
            : null,
        );
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
        comment: comment || undefined,
        kind: "pre",
      }),
    [comment, draft, products, selection, supplier.name, t],
  );
  const pdfKey = pdfInput ? JSON.stringify(pdfInput) : "";

  useEffect(() => {
    primePreparedPdf(preparedPdf, pdfKey, pdfInput);
  }, [pdfInput, pdfKey]);

  const placeDialogOpen = placePhase !== "closed";
  const finalPdfInput = useMemo(() => {
    if (!placeDialogOpen) return null;
    return supplierPrintPdfInput(products, selection, {
      orderNo: draft?.orderNo || draft?.id || t("draft_label"),
      supplierName: supplier.name,
      orderedAt: draft?.placedAt || new Date().toISOString(),
      ...orderPdfWarehouseFields(orderPdfWarehouseOf(warehouses, warehouseId)),
      comment: comment || undefined,
      kind: "final",
    });
  }, [comment, draft, placeDialogOpen, products, selection, supplier.name, t, warehouseId, warehouses]);
  const finalPdfKey = finalPdfInput ? JSON.stringify(finalPdfInput) : "";

  useEffect(() => {
    primePreparedPdf(preparedFinalPdf, finalPdfKey, finalPdfInput);
  }, [finalPdfInput, finalPdfKey]);

  const currentRevision = draft?.revision ?? 0;
  const pdfStale = sharedRevision != null && currentRevision !== sharedRevision;
  const orderedThisRevision = orderedRevision != null && orderedRevision === currentRevision && !pdfStale;
  const orderNo = draft?.orderNo || draft?.id || "";

  const matchesSearch = useCallback(
    (product: OrderProduct) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      const packCodes = product.packs.map((item) => item.code ?? "");
      return [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? "", product.productCode ?? "", product.categoryName ?? "", product.categoryNameVn ?? "", supplier.name, ...packCodes].some(
        (text) => text.toLowerCase().includes(query),
      );
    },
    [search, supplier.name],
  );

  const visible = filterByCategory(products.filter(matchesSearch), category);

  const setQty = (product: OrderProduct, qty: string) => {
    const current = selection[product.id] ?? { packId: defaultPackId(product), qty: "" };
    scheduleSave({ ...selection, [product.id]: { ...current, qty } });
  };

  const setPack = (product: OrderProduct, packId: string) => {
    const current = selection[product.id] ?? { packId, qty: "" };
    scheduleSave({ ...selection, [product.id]: { ...current, packId } });
  };

  const handlePdf = async () => {
    if (pdfBusy || pdfInFlight.current) return;
    if (!pdfInput || !marked.length) {
      setActionError(t("place_need_lines"));
      return;
    }
    if (detectInAppBrowser()) {
      window.alert(t("inapp_blocked"));
      return;
    }
    pdfInFlight.current = true;
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const readyOrPending = takePdfBlob(preparedPdf, pdfKey, pdfInput);
      const blob = readyOrPending instanceof Blob ? readyOrPending : await readyOrPending;
      const fileName = getOrderPdfFileName(pdfInput);
      const sharePromise = beginShareThenPersist(
        () =>
          deliverPdfFile(blob, fileName, {
            title: orderPdfTitle(pdfInput),
            text: fileName,
          }),
        () =>
          persist().then((saved) => {
            if (saved?.id) void freezeDraftPdf(supplier.id).catch(() => null);
            return saved;
          }),
      );
      setActionError(null);
      setPdfBusy(true);
      const delivered = await sharePromise;
      if (delivered !== "shared" && delivered !== "cancelled" && delivered !== "downloaded") {
        setActionError(t("error_pdf"));
      }
    } catch (err) {
      setActionError(errorMessage(err, t("error_network"), t("error_pdf")));
    } finally {
      pdfInFlight.current = false;
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
    if (placeInFlight.current) return;
    const nextPhase = reducePlaceDialog(placePhase, "submit");
    if (!shouldPlaceAfterDialog(nextPhase)) return;
    if (!warehouseId) {
      setDialogError(t("warehouse_required"));
      return;
    }
    placeInFlight.current = true;
    try {
      const finalPdf =
        finalPdfInput ??
        supplierPrintPdfInput(products, selectionRef.current, {
          orderNo: draft?.orderNo || draft?.id || t("draft_label"),
          supplierName: supplier.name,
          orderedAt: draft?.placedAt || new Date().toISOString(),
          ...orderPdfWarehouseFields(orderPdfWarehouseOf(warehouses, warehouseId)),
          comment: comment || undefined,
          kind: "final",
        });
      const shareKey = finalPdf ? JSON.stringify(finalPdf) : "";
      let sharePromise: ReturnType<typeof deliverPdfFile> | null = null;
      if (finalPdf) {
        if (detectInAppBrowser()) {
          window.alert(t("inapp_blocked"));
        } else {
          const readyOrPending = takePdfBlob(preparedFinalPdf, shareKey, finalPdf);
          const blob = readyOrPending instanceof Blob ? readyOrPending : await readyOrPending;
          const fileName = getOrderPdfFileName(finalPdf);
          sharePromise = deliverPdfFile(blob, fileName, {
            title: orderPdfTitle(finalPdf),
            text: fileName,
          });
        }
      }
      setPlacePhase(nextPhase);
      setDialogError(null);
      setActionError(null);
      setPlaceBusy(true);
      const saved = await saveDraft(supplier.id, {
        warehouseId,
        comment: comment.trim() || null,
        expectedDelivery: expectedDelivery || null,
        lines: selectionDraftLines(products, selectionRef.current),
      });
      setDraft(saved);
      if (!saved?.id) {
        if (sharePromise) await sharePromise;
        setPlacePhase("open");
        setDialogError(t("place_need_draft"));
        return;
      }
      const placed = await placeOrder(saved.id, { comment: saved.comment, expectedDelivery: saved.expectedDelivery });
      if (sharePromise) await sharePromise;
      onSelectionRef.current(clearSupplierSelection(selectionRef.current, products.map((product) => product.id)));
      setPlacedId(placed.id);
      setOrderedRevision(placed.revision || saved.revision);
      router.push(`/orders/${placed.id}`);
    } catch (err) {
      setPlacePhase("open");
      setDialogError(errorMessage(err, t("error_network"), t("error_place")));
    } finally {
      placeInFlight.current = false;
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
        visible.map((product) => (
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
        ))
      ) : products.length ? (
        <OrdersEmpty title={t("empty_search")} />
      ) : (
        <OrdersEmpty title={t("empty_products")} />
      )}

      <div className="orders-stickyActions">
        <div className="orders-actions">
          {saveState === "error" ? (
            <button type="button" className="orders-btn dark block" onClick={() => void persist()} disabled={pdfBusy}>
              {t("save_retry")}
            </button>
          ) : null}
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
