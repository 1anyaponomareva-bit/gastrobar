"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getStaffOrderSupplier,
  STAFF_ORDER_CATEGORIES,
  STAFF_ORDER_ITEMS,
  STAFF_ORDER_SUPPLIERS,
  type StaffOrderItem,
  type StaffOrderSupplierId,
} from "@/data/staffOrderItems";
import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import { deliverPdfFile } from "@/lib/deliverPdfFile";
import { translate } from "@/lib/i18n";
import {
  translateStaffCategory,
  translateStaffItemName,
  type StaffAppLang,
} from "@/lib/staffInventoryI18n";
import {
  getStaffInventoryPdfFileName,
  makeSupplierOrderPdfBlob,
  type SupplierOrderPdfOptions,
} from "@/lib/staffInventoryPdf";
import {
  getStoredOrderTab,
  getStoredOrderValue,
  parseNumber,
  setStoredOrderTab,
  setStoredOrderValue,
} from "@/lib/staffInventoryStorage";

type OrderTab = "all" | StaffOrderSupplierId;

type Props = {
  venue: StaffInventoryVenue;
  venueLabel: string;
  date: string;
  employee: string;
  staffLang: StaffAppLang;
  revision: number;
  onChange: () => void;
};

function isOrderTab(value: string): value is OrderTab {
  return value === "all" || STAFF_ORDER_SUPPLIERS.some((s) => s.id === value);
}

function asciiFileLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^A-Za-z0-9]+/g, "");
}

export function StaffOrderList({
  venue,
  venueLabel,
  date,
  employee,
  staffLang,
  revision,
  onChange,
}: Props) {
  const t = useCallback((key: string) => translate(staffLang, key), [staffLang]);
  const [tab, setTab] = useState<OrderTab>("all");
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const preparedRef = useRef<{ key: string; promise: Promise<Blob> } | null>(
    null,
  );

  useEffect(() => {
    const stored = getStoredOrderTab(venue);
    if (isOrderTab(stored)) setTab(stored);
  }, [venue]);

  const values = useMemo(() => {
    void revision;
    return new Map(
      STAFF_ORDER_ITEMS.map((item) => [
        item.id,
        getStoredOrderValue(venue, item.id),
      ]),
    );
  }, [venue, revision]);

  const isMarked = useCallback(
    (item: StaffOrderItem) => parseNumber(values.get(item.id) ?? "") > 0,
    [values],
  );

  const markedBySupplier = useMemo(() => {
    const counts = new Map<StaffOrderSupplierId, number>();
    STAFF_ORDER_ITEMS.forEach((item) => {
      if (isMarked(item)) {
        counts.set(item.supplier, (counts.get(item.supplier) ?? 0) + 1);
      }
    });
    return counts;
  }, [isMarked]);

  const matchesSearch = useCallback(
    (item: StaffOrderItem) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      return [
        item.name,
        translateStaffItemName(staffLang, item.name),
        item.brand ?? "",
        getStaffOrderSupplier(item.supplier).label,
        item.itemNo ?? "",
      ].some((text) => text.toLowerCase().includes(query));
    },
    [search, staffLang],
  );

  const supplier = tab === "all" ? null : getStaffOrderSupplier(tab);

  const supplierItems = useMemo(
    () =>
      supplier
        ? STAFF_ORDER_ITEMS.filter((item) => item.supplier === supplier.id)
        : [],
    [supplier],
  );
  const supplierMarked = supplierItems.filter(isMarked);

  const pdfOptions = useMemo((): SupplierOrderPdfOptions | null => {
    if (!supplier) return null;
    return {
      title: `${venueLabel.toUpperCase()} — ORDER: ${supplier.label.toUpperCase()}`,
      dateLine: translate("en", "staff_pdf_date").replace("{date}", date || "-"),
      employeeLine: translate("en", "staff_pdf_employee").replace(
        "{employee}",
        employee.trim() || "-",
      ),
      emptyMessage: "No items marked for order.",
      rows: supplierMarked.map((item) => ({
        name: item.name,
        details: [item.brand, item.pack].filter(Boolean).join(" · "),
        quantity: parseNumber(values.get(item.id) ?? ""),
        unit: item.unit,
        itemNo: item.itemNo,
      })),
    };
  }, [supplier, supplierMarked, venueLabel, date, employee, values]);

  const pdfKey = pdfOptions ? JSON.stringify(pdfOptions) : "";

  useEffect(() => {
    if (!pdfOptions) {
      preparedRef.current = null;
      return;
    }
    preparedRef.current = {
      key: pdfKey,
      promise: makeSupplierOrderPdfBlob(pdfOptions),
    };
    // pdfKey captures every value used by pdfOptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfKey]);

  const handleTabChange = (next: OrderTab) => {
    setTab(next);
    setStoredOrderTab(venue, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleValueChange = (itemId: string, value: string) => {
    setStoredOrderValue(venue, itemId, value);
    onChange();
  };

  const handleShare = async () => {
    if (!supplier || !pdfOptions || exporting) return;
    setExporting(true);
    try {
      const prepared = preparedRef.current;
      const blob =
        prepared?.key === pdfKey
          ? await prepared.promise
          : await makeSupplierOrderPdfBlob(pdfOptions);
      const fileName = getStaffInventoryPdfFileName(
        venueLabel,
        date,
        `Order_${asciiFileLabel(supplier.label)}`,
      );
      const result = await deliverPdfFile(blob, fileName);
      if (result !== "shared" && result !== "cancelled" && result !== "downloaded") {
        window.alert(t("staff_share_pdf_error"));
      }
    } catch (error) {
      console.error(error);
      window.alert(t("staff_share_pdf_error_generic"));
    } finally {
      setExporting(false);
    }
  };

  const renderCard = (item: StaffOrderItem, showSupplier: boolean) => {
    const marked = isMarked(item);
    const details = [
      item.brand,
      item.pack,
      showSupplier ? getStaffOrderSupplier(item.supplier).label : null,
      item.itemNo ? `#${item.itemNo}` : null,
    ].filter(Boolean);
    return (
      <div key={item.id} className={`card orderCard ${marked ? "marked" : ""}`}>
        <div className="name">{translateStaffItemName(staffLang, item.name)}</div>
        {details.length ? <div className="orderDetails">{details.join(" · ")}</div> : null}
        <div className="row single">
          <div className="field">
            <label>{t("staff_order_qty")}</label>
            <div className="unitInput">
              <input
                inputMode="decimal"
                value={values.get(item.id) ?? ""}
                onChange={(event) => handleValueChange(item.id, event.target.value)}
              />
              <span className="unitSuffix">{item.unit}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const allItems = STAFF_ORDER_ITEMS.filter(
    (item) =>
      (category === "All" || item.category === category) && matchesSearch(item),
  );

  return (
    <>
      <div className="tabs supplierTabs">
        <button
          type="button"
          className={`tab ${tab === "all" ? "active" : ""}`}
          onClick={() => handleTabChange("all")}
        >
          {t("staff_tab_all_plain")}
        </button>
        {STAFF_ORDER_SUPPLIERS.map((option) => {
          const count = markedBySupplier.get(option.id) ?? 0;
          return (
            <button
              key={option.id}
              type="button"
              className={`tab ${tab === option.id ? "active" : ""} ${count ? "hasMarked" : ""}`}
              onClick={() => handleTabChange(option.id)}
            >
              {option.label}
              {count ? <span className="tabCount">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="searchRow">
        <input
          className="search"
          placeholder={t("staff_search_placeholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="dark"
          onClick={() => {
            setSearch("");
            setCategory("All");
          }}
        >
          {t("staff_reset")}
        </button>
      </div>

      {tab === "all" ? (
        <>
          <div className="tabs categoryTabs">
            {["All", ...STAFF_ORDER_CATEGORIES].map((option) => (
              <button
                key={option}
                type="button"
                className={`tab small ${category === option ? "active" : ""}`}
                onClick={() => setCategory(option)}
              >
                {option === "All"
                  ? t("staff_cat_all")
                  : translateStaffCategory(staffLang, option)}
              </button>
            ))}
          </div>

          <div className="mode">
            <span>{t("staff_order_all_hint")}</span>
            <span>
              {t("staff_order_mode_all").replace("{count}", String(allItems.length))}
            </span>
          </div>

          {!allItems.length ? (
            <div className="empty">{t("staff_empty")}</div>
          ) : (
            STAFF_ORDER_CATEGORIES.map((cat) => {
              const inCategory = allItems.filter((item) => item.category === cat);
              if (!inCategory.length) return null;
              return (
                <div key={cat}>
                  <div className="category">{translateStaffCategory(staffLang, cat)}</div>
                  {inCategory.map((item) => renderCard(item, true))}
                </div>
              );
            })
          )}
        </>
      ) : supplier ? (
        <>
          <div className="mode">
            <span>
              {t("staff_order_mode_supplier")
                .replace("{supplier}", supplier.label)
                .replace("{marked}", String(supplierMarked.length))
                .replace("{count}", String(supplierItems.length))}
            </span>
          </div>

          <div className="category">{t("staff_order_marked")}</div>
          {supplierMarked.filter(matchesSearch).length ? (
            supplierMarked.filter(matchesSearch).map((item) => renderCard(item, false))
          ) : (
            <div className="empty">{t("staff_order_none_marked")}</div>
          )}

          {supplierItems.some((item) => !isMarked(item) && matchesSearch(item)) ? (
            <>
              <div className="category">{t("staff_order_other")}</div>
              {supplierItems
                .filter((item) => !isMarked(item) && matchesSearch(item))
                .map((item) => renderCard(item, false))}
            </>
          ) : null}

          <button
            type="button"
            className="gold sectionShare"
            onClick={handleShare}
            disabled={exporting}
          >
            {exporting ? t("staff_sharing_pdf") : t("staff_share_pdf")}
          </button>
          {supplier.zaloUrl ? (
            <a
              className="zaloBtn"
              href={supplier.zaloUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("staff_order_open_zalo")} · {supplier.label}
            </a>
          ) : (
            <p className="note">{t("staff_order_no_zalo")}</p>
          )}
        </>
      ) : null}
    </>
  );
}
