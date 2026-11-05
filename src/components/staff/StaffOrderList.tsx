"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  staffCategoryLabel,
  staffItemLabel,
  staffItemPackLabel,
  type StaffCatalog,
  type StaffCatalogItem,
} from "@/data/staffCatalog";
import { STAFF_ORDER_COMPANY_FOOTER } from "@/data/staffOrderItems";
import type { StaffInventoryVenue } from "@/data/staffInventoryItems";
import { deliverPdfFile, detectInAppBrowser } from "@/lib/deliverPdfFile";
import { translate } from "@/lib/i18n";
import type { StaffAppLang } from "@/lib/staffInventoryI18n";
import {
  getStaffInventoryPdfFileName,
  makeSupplierOrderPdfBlob,
  type SupplierOrderPdfOptions,
} from "@/lib/staffInventoryPdf";
import {
  clearStoredOrderValues,
  getStoredOrderTab,
  getStoredOrderValue,
  parseNumber,
  setStoredOrderTab,
  setStoredOrderValue,
} from "@/lib/staffInventoryStorage";
import { supplierOrderRows } from "@/lib/staffOrderRows";

const ALL = "all";

type Props = {
  catalog: StaffCatalog;
  venue: StaffInventoryVenue;
  venueLabel: string;
  date: string;
  employee: string;
  staffLang: StaffAppLang;
  revision: number;
  onChange: () => void;
};

function asciiFileLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^A-Za-z0-9]+/g, "");
}

export function StaffOrderList({
  catalog,
  venue,
  venueLabel,
  date,
  employee,
  staffLang,
  revision,
  onChange,
}: Props) {
  const t = useCallback((key: string) => translate(staffLang, key), [staffLang]);
  const [tab, setTab] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const preparedRef = useRef<{ key: string; promise: Promise<Blob> } | null>(
    null,
  );

  const items = useMemo(
    () => catalog.items.filter((item) => !item.hidden),
    [catalog],
  );
  const suppliersById = useMemo(
    () => new Map(catalog.suppliers.map((supplier) => [supplier.id, supplier])),
    [catalog],
  );
  const supplierLabel = useCallback(
    (id: string) => suppliersById.get(id)?.label ?? id,
    [suppliersById],
  );

  useEffect(() => {
    const stored = getStoredOrderTab(venue);
    if (stored === ALL || suppliersById.has(stored)) setTab(stored);
  }, [venue, suppliersById]);

  const values = useMemo(() => {
    void revision;
    return new Map(
      items.map((item) => [item.id, getStoredOrderValue(venue, item.id)]),
    );
  }, [venue, revision, items]);

  const isMarked = useCallback(
    (item: StaffCatalogItem) => parseNumber(values.get(item.id) ?? "") > 0,
    [values],
  );

  const markedBySupplier = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (isMarked(item)) {
        counts.set(item.supplier, (counts.get(item.supplier) ?? 0) + 1);
      }
    });
    return counts;
  }, [items, isMarked]);

  const matchesSearch = useCallback(
    (item: StaffCatalogItem) => {
      const query = search.toLowerCase().trim();
      if (!query) return true;
      return [
        item.name,
        item.nameVn,
        item.brand ?? "",
        supplierLabel(item.supplier),
        item.itemNo ?? "",
      ].some((text) => text.toLowerCase().includes(query));
    },
    [search, supplierLabel],
  );

  const supplier = tab === ALL ? null : (suppliersById.get(tab) ?? null);

  const supplierItems = useMemo(
    () => (supplier ? items.filter((item) => item.supplier === supplier.id) : []),
    [supplier, items],
  );
  const supplierMarked = supplierItems.filter(isMarked);

  const pdfOptions = useMemo((): SupplierOrderPdfOptions | null => {
    if (!supplier) return null;
    return {
      title: `${venueLabel.toUpperCase()} — ORDER / ĐƠN ĐẶT HÀNG: ${supplier.label.toUpperCase()}`,
      dateLine: `Date / Ngày: ${date || "-"}`,
      employeeLine: `Employee / Nhân viên: ${employee.trim() || "-"}`,
      emptyMessage: "No items marked for order. / Không có mặt hàng nào được chọn để đặt.",
      footerLines: STAFF_ORDER_COMPANY_FOOTER,
      rows: supplierOrderRows(supplierMarked, supplier.id, (id) =>
        parseNumber(values.get(id) ?? ""),
      ),
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

  const handleTabChange = (next: string) => {
    setTab(next);
    setStoredOrderTab(venue, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setSearch("");
    setCategory(ALL);
    const scope = supplier ? supplierItems : items;
    const filled = scope.filter((item) => (values.get(item.id) ?? "").trim() !== "");
    if (!filled.length) return;
    const message = supplier
      ? t("staff_order_reset_supplier").replace("{supplier}", supplier.label)
      : t("staff_order_reset_all");
    if (!window.confirm(message)) return;
    clearStoredOrderValues(
      venue,
      filled.map((item) => item.id),
    );
    onChange();
  };

  const handleValueChange = (itemId: string, value: string) => {
    setStoredOrderValue(venue, itemId, value);
    onChange();
  };

  const handleShare = async () => {
    if (!supplier || !pdfOptions || exporting) return;
    if (detectInAppBrowser()) {
      window.alert(t("staff_inapp_share_blocked"));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
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

  const renderCard = (item: StaffCatalogItem, showSupplier: boolean) => {
    const marked = isMarked(item);
    const packLabel = staffItemPackLabel(item);
    const details = [
      item.brand,
      showSupplier ? supplierLabel(item.supplier) : null,
      item.itemNo ? `#${item.itemNo}` : null,
    ].filter(Boolean);
    return (
      <div key={item.id} className={`card orderCard ${marked ? "marked" : ""}`}>
        <div className="name">{staffItemLabel(item)}</div>
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
            {packLabel ? <div className="packHint">{packLabel}</div> : null}
          </div>
        </div>
      </div>
    );
  };

  const renderByCategory = (list: StaffCatalogItem[], showSupplier: boolean) =>
    catalog.categories.map((cat) => {
      const inCategory = list.filter((item) => item.category === cat.id);
      if (!inCategory.length) return null;
      return (
        <div key={cat.id}>
          <div className="category">{staffCategoryLabel(cat)}</div>
          {inCategory.map((item) => renderCard(item, showSupplier))}
        </div>
      );
    });

  const allItems = items.filter(
    (item) => (category === ALL || item.category === category) && matchesSearch(item),
  );
  const filteredSupplierItems = supplierItems.filter(matchesSearch);

  return (
    <>
      <div className="tabs supplierTabs">
        <button
          type="button"
          className={`tab ${tab === ALL ? "active" : ""}`}
          onClick={() => handleTabChange(ALL)}
        >
          {t("staff_tab_all_plain")}
        </button>
        {catalog.suppliers.map((option) => {
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
          onClick={handleReset}
        >
          {t("staff_reset")}
        </button>
      </div>

      {tab === ALL ? (
        <>
          <div className="tabs categoryTabs">
            <button
              type="button"
              className={`tab small ${category === ALL ? "active" : ""}`}
              onClick={() => setCategory(ALL)}
            >
              {t("staff_cat_all")}
            </button>
            {catalog.categories.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`tab small ${category === option.id ? "active" : ""}`}
                onClick={() => setCategory(option.id)}
              >
                {staffCategoryLabel(option)}
              </button>
            ))}
          </div>

          <div className="mode">
            <span>{t("staff_order_all_hint")}</span>
            <span>
              {t("staff_order_mode_all").replace("{count}", String(allItems.length))}
            </span>
          </div>

          {allItems.length ? (
            renderByCategory(allItems, true)
          ) : (
            <div className="empty">{t("staff_empty")}</div>
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

          {filteredSupplierItems.length ? (
            renderByCategory(filteredSupplierItems, false)
          ) : (
            <div className="empty">{t("staff_empty")}</div>
          )}

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
