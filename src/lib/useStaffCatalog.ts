"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_STAFF_CATALOG,
  sanitizeStaffCatalog,
  type StaffCatalog,
} from "@/data/staffCatalog";

const CACHE_KEY = "gf_staff_catalog_v1";

function readCache(): StaffCatalog | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? sanitizeStaffCatalog(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const REFRESH_MS = 60_000;

/**
 * Order catalog shared with the ERP. The last fetched copy is kept for offline use; an open list
 * picks up changes on focus and every minute.
 */
export function useStaffCatalog(): StaffCatalog {
  const [catalog, setCatalog] = useState<StaffCatalog>(DEFAULT_STAFF_CATALOG);

  useEffect(() => {
    const cached = readCache();
    if (cached) setCatalog(cached);
    let cancelled = false;
    let lastJson = cached ? JSON.stringify(cached) : "";
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/staff-catalog", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { catalog?: unknown } | null) => {
          const fresh = sanitizeStaffCatalog(data?.catalog);
          if (!fresh || cancelled) return;
          const json = JSON.stringify(fresh);
          if (json === lastJson) return;
          lastJson = json;
          setCatalog(fresh);
          try {
            window.localStorage.setItem(CACHE_KEY, json);
          } catch {
            // Storage full or disabled: the catalog still works for this visit.
          }
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return catalog;
}
