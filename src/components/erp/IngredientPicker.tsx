"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { productTitle } from "@/lib/erp/costing";
import {
  compositionCategoryIds,
  compositionKindOf,
  filterCompositionComponents,
  type CompositionKindFilter,
} from "@/lib/erp/ingredientSearch";
import type { ErpState } from "@/lib/erp/types";
import { categoryLabel, visibleCategories } from "./menuFields";
import { T, unitLabel } from "./ui";

const KIND_ALL: CompositionKindFilter = "all";

/** Typeahead for recipe/tech-card composition: ingredients and other preps, by kind, category and name prefix. */
export function IngredientPicker({
  state,
  value,
  onChange,
  disabled,
  excludeIds,
}: {
  state: ErpState;
  value: string | null | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
  excludeIds?: readonly string[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CompositionKindFilter>(KIND_ALL);
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const selected = value ? state.products.find((product) => product.id === value) : undefined;
  const placeholder = T("Найти ингредиент или п/ф…", "Find an ingredient or prep…", "Tìm nguyên liệu hoặc bán TP…");
  const skipped = excludeIds ?? [];

  const kindTabs = useMemo(
    () => [
      { id: "all" as const, label: T("Все", "All", "Tất cả") },
      { id: "ingredient" as const, label: T("Ингредиенты", "Ingredients", "Nguyên liệu") },
      { id: "prep" as const, label: T("Полуфабрикаты", "Preps", "Bán thành phẩm") },
    ],
    [],
  );

  const chips = useMemo(() => {
    const { ids, hasUncategorized } = compositionCategoryIds(state.products, { kind, excludeIds: skipped });
    const used = new Set(ids);
    const rows = visibleCategories(state.categories)
      .filter((item) => used.has(item.id))
      .map((item) => ({ id: item.id, label: categoryLabel(item) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
    return [
      { id: "all", label: T("Все", "All", "Tất cả") },
      ...rows,
      ...(hasUncategorized ? [{ id: "none", label: T("Без категории", "No category", "Chưa phân nhóm") }] : []),
    ];
  }, [state.products, state.categories, kind, skipped]);

  const matches = useMemo(
    () => filterCompositionComponents(state.products, query, { kind, categoryId: category, excludeIds: skipped }),
    [state.products, query, kind, category, skipped],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (disabled) {
    return <span className="erpName">{selected ? productTitle(selected) : "—"}</span>;
  }

  const pick = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  const kindLabel = (type: string) =>
    compositionKindOf(type) === "prep"
      ? T("п/ф", "prep", "bán TP")
      : T("сырьё", "ingredient", "NL");

  return (
    <div className={`erpIngPicker${open ? " open" : ""}`} ref={root}>
      <button
        type="button"
        className={`erpIngField${selected ? "" : " empty"}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={T("Продукт", "Product", "Sản phẩm")}
        onClick={() => setOpen(true)}
      >
        {selected ? productTitle(selected) : placeholder}
      </button>
      {open ? (
        <div className="erpIngDrop">
          <div className="erpIngCats" role="tablist" aria-label={T("Тип", "Type", "Loại")} data-testid="composition-kind-tabs">
            {kindTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={kind === tab.id}
                className={`erpIngChip ${kind === tab.id ? "on" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setKind(tab.id);
                  setCategory("all");
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {chips.length > 1 ? (
            <div className="erpIngCats" role="tablist" aria-label={T("Категория", "Category", "Nhóm")}>
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={category === chip.id}
                  className={`erpIngChip ${category === chip.id ? "on" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setCategory(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
          <input
            ref={searchRef}
            className="erpPickerSearch"
            type="search"
            value={query}
            placeholder={placeholder}
            aria-label={T("Поиск состава", "Composition search", "Tìm thành phần")}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (matches[0]) pick(matches[0].id);
              }
            }}
          />
          <ul className="erpIngList" role="listbox">
            {matches.length ? (
              matches.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={product.id === value}
                    className={product.id === value ? "on" : ""}
                    onClick={() => pick(product.id)}
                  >
                    <span className="erpIngRow">
                      <span className="erpIngRowName">
                        {productTitle(product)}
                        {product.base_unit ? ` (${unitLabel(product.base_unit)})` : ""}
                      </span>
                      <span className={`erpIngKind ${compositionKindOf(product.type) === "prep" ? "prep" : ""}`}>
                        {kindLabel(product.type)}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="erpIngEmpty">{T("Ничего не найдено", "No matches", "Không tìm thấy")}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
