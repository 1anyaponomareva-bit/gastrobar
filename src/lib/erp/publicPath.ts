/**
 * Public ERP URLs on gastrofood.vn have no `/erp` prefix.
 * Internal Next routes stay under `app/erp/*`. Middleware rewrites the public path.
 */

export const CANONICAL_ERP_HOST = "gastrofood.vn";
export const ERP_WWW_HOST = "www.gastrofood.vn";
export const CANONICAL_ERP_ORIGIN = "https://gastrofood.vn";

/** First URL segment of every ERP page after stripping `/erp`. */
export const ERP_PAGE_SEGMENTS = [
  "stock",
  "menu",
  "products",
  "preps",
  "documents",
  "catalog",
  "production",
  "review",
  "service",
  "settings",
] as const;

export const MINI_APP_SEGMENTS = [
  "staff",
  "recipes",
  "kitchen",
  "check",
  "test",
  "bar",
  "food",
  "poster-test",
  "games",
  "durak",
  "start",
  "wheel-demo",
  "schedule",
] as const;

export function splitHref(href: string): { pathname: string; search: string; hash: string } {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const searchIndex = withoutHash.indexOf("?");
  const search = searchIndex >= 0 ? withoutHash.slice(searchIndex) : "";
  const pathname = searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash;
  return { pathname: pathname || "/", search, hash };
}

function joinHref(pathname: string, search: string, hash = ""): string {
  return `${pathname || "/"}${search}${hash}`;
}

export function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

export function isErpPagePath(pathname: string): boolean {
  return pathname === "/erp" || pathname.startsWith("/erp/");
}

export function isErpPublicPagePath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  const seg = firstSegment(pathname);
  return (ERP_PAGE_SEGMENTS as readonly string[]).includes(seg);
}

export function isMiniAppPath(pathname: string): boolean {
  const seg = firstSegment(pathname);
  return (MINI_APP_SEGMENTS as readonly string[]).includes(seg);
}

export function toInternalErpPathname(pathname: string): string {
  const path = pathname || "/";
  if (path === "/erp" || path.startsWith("/erp/")) return path.replace(/\/+$/, "") || "/erp";
  if (path === "/" || path === "") return "/erp";
  return `/erp${path.startsWith("/") ? path : `/${path}`}`.replace(/\/+$/, "") || "/erp";
}

export function toPublicErpPathname(pathname: string): string {
  const path = pathname || "/";
  if (path === "/erp" || path === "/erp/") return "/";
  if (path.startsWith("/erp/")) return path.slice(4) || "/";
  return path || "/";
}

export function toInternalErpHref(href: string): string {
  const { pathname, search, hash } = splitHref(href);
  return joinHref(toInternalErpPathname(pathname), search, hash);
}

export function toPublicErpHref(href: string): string {
  const { pathname, search, hash } = splitHref(href);
  return joinHref(toPublicErpPathname(pathname), search, hash);
}

export function publicErpHref(href: string, stripPrefix: boolean): string {
  if (!stripPrefix) return href;
  return toPublicErpHref(href);
}
