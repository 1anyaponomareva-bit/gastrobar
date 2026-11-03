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

/** Order catalog edited in /staff/admin; the last fetched copy is kept for offline use. */
export function useStaffCatalog(): StaffCatalog {
  const [catalog, setCatalog] = useState<StaffCatalog>(DEFAULT_STAFF_CATALOG);

  useEffect(() => {
    const cached = readCache();
    if (cached) setCatalog(cached);
    let cancelled = false;
    fetch("/api/staff-catalog", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { catalog?: unknown } | null) => {
        const fresh = sanitizeStaffCatalog(data?.catalog);
        if (!fresh || cancelled) return;
        setCatalog(fresh);
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
        } catch {
          // Storage full or disabled: the catalog still works for this visit.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return catalog;
}
