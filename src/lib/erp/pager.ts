export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 100;
export const PAGE_SIZE_STORAGE_KEY = "gastrofood-erp-page-size";

export function parsePageSize(value: unknown): PageSize {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

export function readStoredPageSize(): PageSize {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  try {
    return parsePageSize(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function writeStoredPageSize(size: PageSize): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(parsePageSize(size)));
  } catch {
    /* quota / private mode */
  }
}

export function pageCount(total: number, pageSize: number): number {
  const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const pages = pageCount(total, pageSize);
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(Math.trunc(page), pages - 1);
}

export function pageBounds(total: number, page: number, pageSize: number) {
  const pages = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);
  const from = total ? current * pageSize + 1 : 0;
  const to = Math.min(total, (current + 1) * pageSize);
  return { from, to, current, pages };
}

export function slicePage<T>(list: readonly T[], page: number, pageSize: number) {
  const pages = pageCount(list.length, pageSize);
  const current = clampPage(page, list.length, pageSize);
  return {
    rows: list.slice(current * pageSize, current * pageSize + pageSize),
    current,
    pages,
  };
}
