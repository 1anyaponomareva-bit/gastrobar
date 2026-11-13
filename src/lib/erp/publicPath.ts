/**
 * Public ERP URLs keep the `/erp` prefix on every host (gastrofood.vn and gastrotruck.org).
 * Internal Next routes stay under `app/erp/*`. gastrofood.vn `/` is a public menu stub, not ERP.
 */

export const CANONICAL_ERP_HOST = "gastrofood.vn";
export const ERP_WWW_HOST = "www.gastrofood.vn";
export const CANONICAL_ERP_ORIGIN = "https://gastrofood.vn";

/** Internal path the gastrofood homepage rewrites to. Not linked from the public stub. */
export const GASTROFOOD_STUB_PATH = "/coming-soon";

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
  "purchasing",
  "finance",
] as const;

/** Poster Processing list (moved from Stock). */
export const PROCESSING_LIST_PATH = "/erp/menu/processing";

export function processingDocPath(id: string): string {
  return `${PROCESSING_LIST_PATH}/${id}`;
}

/**
 * Old processing URLs → `/erp/menu/processing`. Same-host 307 so bookmarks keep working.
 * `/erp/preps/batches` is checked before `/erp/preps/batch` so it does not become `.../es`.
 */
export function movedErpPagePath(pathname: string): string | null {
  const path = trimTrailingSlash(pathname || "/");
  const tailAfter = (prefix: string): string | null => {
    if (path === prefix) return "";
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
    return null;
  };
  if (path === "/erp/preps/batches" || path === "/preps/batches") return PROCESSING_LIST_PATH;
  if (path === "/erp/production" || path === "/production") return PROCESSING_LIST_PATH;
  for (const prefix of ["/erp/stock/processing", "/stock/processing", "/erp/preps/batch", "/preps/batch"]) {
    const tail = tailAfter(prefix);
    if (tail !== null) return `${PROCESSING_LIST_PATH}${tail}`;
  }
  return null;
}

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

function trimTrailingSlash(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

export function isErpPagePath(pathname: string): boolean {
  return pathname === "/erp" || pathname.startsWith("/erp/");
}

/** gastrofood.vn `/` (and the internal rewrite target, including Next icon routes). Not ERP. */
export function isGastrofoodStubPath(pathname: string): boolean {
  const path = trimTrailingSlash(pathname || "/");
  return path === "/" || path === GASTROFOOD_STUB_PATH || path.startsWith(`${GASTROFOOD_STUB_PATH}/`);
}

/** Old unprefixed ERP URLs (`/stock`, `/menu`, …) from the previous public-path scheme. */
export function isUnprefixedErpPagePath(pathname: string): boolean {
  const seg = firstSegment(pathname);
  return (ERP_PAGE_SEGMENTS as readonly string[]).includes(seg);
}

/** Pages this host may serve as HTML: stub + `/erp`. Unprefixed ERP paths 307 to `/erp`. */
export function isErpPublicPagePath(pathname: string): boolean {
  return isGastrofoodStubPath(pathname) || isErpPagePath(pathname);
}

export function isMiniAppPath(pathname: string): boolean {
  const seg = firstSegment(pathname);
  return (MINI_APP_SEGMENTS as readonly string[]).includes(seg);
}

export function toInternalErpPathname(pathname: string): string {
  const path = pathname || "/";
  if (path === "/erp" || path.startsWith("/erp/")) return trimTrailingSlash(path) || "/erp";
  if (path === "/" || path === "") return "/erp";
  return trimTrailingSlash(`/erp${path.startsWith("/") ? path : `/${path}`}`) || "/erp";
}

/** Canonical public ERP path: keep `/erp`. Unprefixed ERP segments get the prefix. `/` stays the stub. */
export function toPublicErpPathname(pathname: string): string {
  const path = pathname || "/";
  if (isErpPagePath(path)) return trimTrailingSlash(path) || "/erp";
  if (isUnprefixedErpPagePath(path)) return toInternalErpPathname(path);
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
