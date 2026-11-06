/**
 * ERP domain-move host gate. Same Vercel project `gastrobar`, same Supabase DB.
 * Split flags: (A) new ERP hostname(s) vs (B) redirect-from-legacy. Independent.
 *
 * Exact allowlist on the NEW ERP host (session/permission checks stay in route
 * handlers; this gate does not weaken auth):
 *   - ERP pages: `/erp`, `/erp/*`
 *   - ERP APIs: `/api/erp`, `/api/erp/*` (same-origin relative fetch stays here)
 *   - Auth ERP actually uses (confirmed in ErpShell + AdminAuthForm):
 *       POST/GET `/api/recipes-admin/login`
 *       POST/GET `/api/recipes-admin/logout`
 *       POST/GET `/api/recipes-admin/register` (invite query on `/erp?invite=`)
 *       GET `/api/recipes-admin/session` (shared cookie helper; ERP shell uses `/api/erp/session`)
 *   - `/_next/*` plus favicon/icon and image/font files Next serves for the ERP UI
 *
 * Other PAGES on the new host: 307/302 to the same path on https://www.gastrotruck.org
 * Other APIs on the new host: JSON 404/403 — never an HTML redirect
 *
 * Legacy public hosts (www.gastrotruck.org, gastrotruck.org):
 *   - B OFF → old `/erp` and `/api/erp` stay as today (dual-run / rollback)
 *   - B ON  → GET/HEAD `/erp` 307 only (never 308 here; never POST/PUT/PATCH/DELETE)
 *   - C (close old API) only applies while B is ON; B OFF keeps old API authorized
 *
 * Do not put gastrotruck.org (or its subdomains) in ERP_HOSTS.
 * Do not set cookie Domain= across gastrotruck.org and the new host.
 */

export const LEGACY_PUBLIC_HOSTS = ["www.gastrotruck.org", "gastrotruck.org"] as const;
export const LEGACY_PUBLIC_ORIGIN = "https://www.gastrotruck.org";

const RECIPES_ADMIN_AUTH_PATHS = [
  "/api/recipes-admin/login",
  "/api/recipes-admin/logout",
  "/api/recipes-admin/register",
  "/api/recipes-admin/session",
] as const;

export type ErpHostGateConfig = {
  /** A: new ERP hostname(s). Empty = no new-host gate and no redirect target. */
  erpHosts: string[];
  /** B: temporary GET/HEAD 307 of `/erp` from legacy public hosts. */
  redirectFromLegacy: boolean;
  /** C: JSON-close old `/api/erp`. Ignored while B is off. */
  closeLegacyApi: boolean;
};

export type ErpHostGateInput = {
  hostHeader: string;
  pathname: string;
  search: string;
  method: string;
};

export type ErpHostGateResult =
  | { action: "allow" }
  | { action: "redirect"; status: 307; location: string }
  | { action: "json"; status: number; body: Record<string, unknown> };

export function envFlagOn(value: string | undefined | null): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function hostnameOf(hostHeader: string): string {
  return hostHeader.split(":")[0]?.trim().toLowerCase().replace(/\.$/, "") ?? "";
}

function isGastrotruckHost(hostname: string): boolean {
  return hostname === "gastrotruck.org" || hostname.endsWith(".gastrotruck.org");
}

export function parseHostList(raw: string | undefined | null): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let host = trimmed;
    try {
      if (host.includes("://")) host = new URL(host).hostname;
      else host = host.replace(/^\/+/, "").split("/")[0] ?? host;
    } catch {
      continue;
    }
    host = hostnameOf(host);
    if (!host || isGastrotruckHost(host) || seen.has(host)) continue;
    seen.add(host);
    hosts.push(host);
  }
  return hosts;
}

export function readErpHostGateConfig(env: Record<string, string | undefined>): ErpHostGateConfig {
  return {
    erpHosts: parseHostList(env.ERP_HOSTS),
    redirectFromLegacy: envFlagOn(env.ERP_REDIRECT_FROM_LEGACY),
    closeLegacyApi: envFlagOn(env.ERP_CLOSE_LEGACY_API),
  };
}

export function isNamedErpHost(hostname: string, config: ErpHostGateConfig): boolean {
  if (!hostname || config.erpHosts.length === 0) return false;
  return config.erpHosts.includes(hostnameOf(hostname));
}

export function isLegacyPublicHost(hostname: string): boolean {
  const host = hostnameOf(hostname);
  return (LEGACY_PUBLIC_HOSTS as readonly string[]).includes(host);
}

function pathExact(pathname: string, exact: string): boolean {
  return pathname === exact || pathname === `${exact}/`;
}

function pathUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isErpPagePath(pathname: string): boolean {
  return pathUnder(pathname, "/erp");
}

export function isErpApiPath(pathname: string): boolean {
  return pathUnder(pathname, "/api/erp");
}

function isRecipesAdminAuthPath(pathname: string): boolean {
  return RECIPES_ADMIN_AUTH_PATHS.some((path) => pathExact(pathname, path));
}

function isNextOrStaticPath(pathname: string): boolean {
  if (pathUnder(pathname, "/_next")) return true;
  if (
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/icon.png" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt"
  ) {
    return true;
  }
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(pathname);
}

/** Paths the new ERP host may serve. Everything else is redirected or JSON-refused. */
export function isErpHostAllowedPath(pathname: string): boolean {
  return isErpPagePath(pathname) || isErpApiPath(pathname) || isRecipesAdminAuthPath(pathname) || isNextOrStaticPath(pathname);
}

export function isApiOrProxyPath(pathname: string): boolean {
  return pathUnder(pathname, "/api") || pathUnder(pathname, "/supabase-proxy");
}

function isGetLike(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}

function absoluteUrl(origin: string, pathname: string, search: string): string {
  const url = new URL(origin.includes("://") ? origin : `https://${origin}`);
  url.pathname = pathname || "/";
  url.search = search.startsWith("?") ? search.slice(1) : search;
  return url.toString();
}

const OTHER_API_BODY = { error: "not_found", message: "This host only serves ERP." };
const OTHER_WRITE_BODY = { error: "refused", message: "This host only serves ERP." };

export function decideErpHostGate(input: ErpHostGateInput, config: ErpHostGateConfig): ErpHostGateResult {
  const host = hostnameOf(input.hostHeader);
  const pathname = input.pathname || "/";
  const search = input.search || "";
  const method = input.method || "GET";

  if (isNamedErpHost(host, config)) {
    if (isErpHostAllowedPath(pathname)) return { action: "allow" };
    if (isApiOrProxyPath(pathname)) return { action: "json", status: 404, body: OTHER_API_BODY };
    if (isGetLike(method)) {
      return { action: "redirect", status: 307, location: absoluteUrl(LEGACY_PUBLIC_ORIGIN, pathname, search) };
    }
    return { action: "json", status: 403, body: OTHER_WRITE_BODY };
  }

  if (isLegacyPublicHost(host) && isErpPagePath(pathname)) {
    const target = config.erpHosts[0];
    if (config.redirectFromLegacy && target && isGetLike(method)) {
      return { action: "redirect", status: 307, location: absoluteUrl(`https://${target}`, pathname, search) };
    }
    return { action: "allow" };
  }

  if (isLegacyPublicHost(host) && isErpApiPath(pathname)) {
    // Writes are never redirected. Close only after cutover (B ON + C ON + named host).
    if (config.redirectFromLegacy && config.closeLegacyApi && config.erpHosts[0]) {
      const body: Record<string, unknown> = {
        error: "erp_moved",
        message:
          "ERP API moved off this host. Open ERP on the new hostname. POST, PUT, PATCH and DELETE are not redirected.",
      };
      if (config.erpHosts[0]) body.newOrigin = `https://${config.erpHosts[0]}`;
      return { action: "json", status: 410, body };
    }
    return { action: "allow" };
  }

  return { action: "allow" };
}

export const ERP_HOST_GATE_NO_STORE = "no-store, no-cache, max-age=0, must-revalidate";
