"use client";

import { useEffect, useRef } from "react";
import { useHorizontalScrollOnWheel } from "@/lib/useHorizontalScrollOnWheel";
import type { CatalogCategory } from "@/lib/orders/orderList";

type Props = {
  categories: CatalogCategory[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
};

export function OrderCategoryTabs({ categories, value, onChange, ariaLabel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScrollOnWheel(scrollRef);

  useEffect(() => {
    const active = scrollRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [value]);

  if (categories.length <= 1) return null;

  return (
    <div ref={scrollRef} className="orders-categoryTabs" role="tablist" aria-label={ariaLabel}>
      {categories.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={`orders-chip ${value === option.id ? "active" : ""}`}
          onClick={() => onChange(option.id)}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}
