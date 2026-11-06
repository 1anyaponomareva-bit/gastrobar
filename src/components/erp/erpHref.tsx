"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { publicErpHref, toInternalErpPathname } from "@/lib/erp/publicPath";

const StripCtx = createContext(false);

export function ErpHrefProvider({ stripPrefix, children }: { stripPrefix: boolean; children: ReactNode }) {
  return <StripCtx.Provider value={stripPrefix}>{children}</StripCtx.Provider>;
}

export function useErpStripPrefix(): boolean {
  return useContext(StripCtx);
}

export function useErpHref(href: string): string {
  return publicErpHref(href, useContext(StripCtx));
}

export function useInternalPathname(pathname: string | null): string {
  return toInternalErpPathname(pathname || "/");
}

export function useErpRouter() {
  const strip = useContext(StripCtx);
  const router = useRouter();
  const push = useCallback((href: string, opts?: { scroll?: boolean }) => router.push(publicErpHref(href, strip), opts), [router, strip]);
  const replace = useCallback(
    (href: string, opts?: { scroll?: boolean }) => router.replace(publicErpHref(href, strip), opts),
    [router, strip],
  );
  return useMemo(() => ({ push, replace }), [push, replace]);
}
