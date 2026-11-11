"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageBounds,
  parsePageSize,
  readStoredPageSize,
  writeStoredPageSize,
  type PageSize,
} from "@/lib/erp/pager";
import { T } from "./ui";

export function usePageSize(): [PageSize, (size: PageSize) => void] {
  const [size, setSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  useEffect(() => setSize(readStoredPageSize()), []);
  const set = useCallback((next: PageSize) => {
    const value = parsePageSize(next);
    setSize(value);
    writeStoredPageSize(value);
  }, []);
  return [size, set];
}

export function Pager({
  total,
  page,
  pages,
  pageSize,
  onPage,
  onPageSize,
  showSize = true,
}: {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize?: (size: PageSize) => void;
  showSize?: boolean;
}) {
  if (!total) return null;
  const { from, to } = pageBounds(total, page, pageSize);
  const sizeLabel = T("Показывать", "Show", "Hiển thị");
  const btn = (label: string, target: number, disabled: boolean, text: string) => (
    <button type="button" className="erpPagerBtn" aria-label={label} disabled={disabled} onClick={() => onPage(target)}>
      {text}
    </button>
  );
  return (
    <div className="erpPager">
      <span>
        {from}–{to} {T("из", "of", "/")} {total}
      </span>
      {showSize && onPageSize ? (
        <span className="erpPagerSizes" role="group" aria-label={sizeLabel} data-testid="erp-page-size">
          <span className="erpPagerSizesLabel">{sizeLabel}</span>
          {PAGE_SIZES.map((size, i) => (
            <Fragment key={size}>
              {i > 0 ? (
                <span className="erpPagerSizeSep" aria-hidden>
                  |
                </span>
              ) : null}
              <button
                type="button"
                className={`erpPagerSize${size === pageSize ? " on" : ""}`}
                aria-pressed={size === pageSize}
                onClick={() => {
                  if (size !== pageSize) onPageSize(size);
                }}
              >
                {size}
              </button>
            </Fragment>
          ))}
        </span>
      ) : null}
      <span className="erpPagerBtns">
        {btn(T("Первая страница", "First page", "Trang đầu"), 0, page === 0, "«")}
        {btn(T("Предыдущая страница", "Previous page", "Trang trước"), page - 1, page === 0, "‹")}
        <span>
          {T("Стр.", "Page", "Trang")} {page + 1} {T("из", "of", "/")} {pages}
        </span>
        {btn(T("Следующая страница", "Next page", "Trang sau"), page + 1, page >= pages - 1, "›")}
        {btn(T("Последняя страница", "Last page", "Trang cuối"), pages - 1, page >= pages - 1, "»")}
      </span>
    </div>
  );
}
