"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isNamedErpHost, productionErpHostEnv, readErpHostGateConfig } from "@/lib/erp/hostGate";
import { publicErpHref, toInternalErpPathname } from "@/lib/erp/publicPath";

const StripCtx = createContext(false);

function stripPrefixOnThisHost(): boolean {
  return isNamedErpHost(window.location.hostname, readErpHostGateConfig(productionErpHostEnv({})));
}

export function ErpHrefProvider({ stripPrefix = false, children }: { stripPrefix?: boolean; children: ReactNode }) {
  const [strip, setStrip] = useState(stripPrefix);
  useEffect(() => {
    setStrip(stripPrefixOnThisHost());
  }, []);
  return <StripCtx.Provider value={strip}>{children}</StripCtx.Provider>;
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
