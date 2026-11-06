/** Menu catalog list filters in the URL so Back / Назад restore the same list. */

export type MenuListQuery = {
  q: string;
  category: string[];
  unit: string[];
  supplier: string[];
  archived: boolean;
  sort: string;
  desc: boolean;
};

export const EMPTY_MENU_LIST_QUERY: MenuListQuery = {
  q: "",
  category: [],
  unit: [],
  supplier: [],
  archived: false,
  sort: "",
  desc: false,
};

/** Poster-style Menu lists that own their own filters. Not /erp/products. */
export const MENU_LIST_PATHS = ["/erp/menu", "/erp/menu/ingredients", "/erp/menu/recipes", "/erp/menu/preps"] as const;

export type MenuListPath = (typeof MENU_LIST_PATHS)[number];

const LIST_PATH_SET = new Set<string>(MENU_LIST_PATHS);

function csv(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function parseMenuListSearch(search: string | URLSearchParams): MenuListQuery {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  return {
    q: params.get("q")?.trim() ?? "",
    category: csv(params.get("category")),
    unit: csv(params.get("unit")),
    supplier: csv(params.get("supplier")),
    archived: params.get("archived") === "1",
    sort: params.get("sort")?.trim() ?? "",
    desc: params.get("desc") === "1",
  };
}

export function menuListSearchString(query: MenuListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category.length) params.set("category", query.category.join(","));
  if (query.unit.length) params.set("unit", query.unit.join(","));
  if (query.supplier.length) params.set("supplier", query.supplier.join(","));
  if (query.archived) params.set("archived", "1");
  if (query.sort) params.set("sort", query.sort);
  if (query.desc) params.set("desc", "1");
  return params.toString();
}

export function menuListHref(path: string, query: MenuListQuery): string {
  const qs = menuListSearchString(query);
  return qs ? `${path}?${qs}` : path;
}

function isMenuListPath(pathname: string): pathname is MenuListPath {
  return LIST_PATH_SET.has(pathname);
}

/** Only Menu list URLs. Drops open redirects and /erp/products. */
export function safeMenuListReturn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/erp/menu")) return null;
  if (/[\r\n\\]/.test(trimmed) || trimmed.includes("://")) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://gastrotruck.local");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://gastrotruck.local") return null;
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!isMenuListPath(pathname)) return null;
  return menuListHref(pathname, parseMenuListSearch(parsed.searchParams));
}

export function menuListBackHref(from: string | null | undefined, fallback: string): string {
  return safeMenuListReturn(from) ?? fallback;
}

/** Puts the current list URL on a card link as `from`. */
export function withMenuListReturn(href: string, listHref: string): string {
  const from = safeMenuListReturn(listHref);
  if (!from) return href;
  try {
    const url = new URL(href, "https://gastrotruck.local");
    if (url.origin !== "https://gastrotruck.local") return href;
    url.searchParams.set("from", from);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}
