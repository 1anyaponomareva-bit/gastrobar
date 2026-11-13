"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { productTitle } from "@/lib/erp/costing";
import { compositionCategoryIds, filterCompositionIngredients } from "@/lib/erp/ingredientSearch";
import type { ErpState } from "@/lib/erp/types";
import { categoryLabel, visibleCategories } from "./menuFields";
import { T, unitLabel } from "./ui";

/** Typeahead for recipe/tech-card composition: ingredients only, by category and name prefix. */
export function IngredientPicker({
  state,
  value,
  onChange,
  disabled,
}: {
  state: ErpState;
  value: string | null | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const selected = value ? state.products.find((product) => product.id === value) : undefined;

  const chips = useMemo(() => {
    const { ids, hasUncategorized } = compositionCategoryIds(state.products);
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
  }, [state.products, state.categories]);

  const matches = useMemo(
    () => filterCompositionIngredients(state.products, query, category),
    [state.products, query, category],
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

  if (disabled) {
    return <span className="erpName">{selected ? productTitle(selected) : "—"}</span>;
  }

  const pick = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="erpIngPicker" ref={root}>
      {chips.length > 1 ? (
        <div className="erpIngCats" role="tablist" aria-label={T("Категория", "Category", "Nhóm")}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={category === chip.id}
              className={`erpIngChip ${category === chip.id ? "on" : ""}`}
              onClick={() => {
                setCategory(chip.id);
                setOpen(true);
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      <input
        className="erpPickerSearch"
        type="search"
        value={query}
        placeholder={
          selected
            ? productTitle(selected)
            : T("Найти ингредиент…", "Find an ingredient…", "Tìm nguyên liệu…")
        }
        aria-label={T("Поиск ингредиента", "Ingredient search", "Tìm nguyên liệu")}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (matches[0]) pick(matches[0].id);
          }
        }}
      />
      {open ? (
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
                  {productTitle(product)}
                  {product.base_unit ? ` (${unitLabel(product.base_unit)})` : ""}
                </button>
              </li>
            ))
          ) : (
            <li className="erpIngEmpty">{T("Ничего не найдено", "No matches", "Không tìm thấy")}</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
