"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useErpRouter } from "./erpHref";
import {
  menuListHref,
  parseMenuListSearch,
  type MenuListPath,
  type MenuListQuery,
} from "@/lib/erp/menuListQuery";

export function useMenuListQuery(listPath: MenuListPath) {
  const router = useErpRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const query = useMemo(() => parseMenuListSearch(search), [search]);
  const href = menuListHref(listPath, query);

  const set = useCallback(
    (patch: Partial<MenuListQuery>) => {
      const next = menuListHref(listPath, { ...query, ...patch });
      if (next === href) return;
      router.replace(next, { scroll: false });
    },
    [href, listPath, query, router],
  );

  return { ...query, href, set };
}
