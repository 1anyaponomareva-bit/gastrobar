"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LOSS_METHODS, lossPct, netFactor, roundQty, usableWeight, type LossMethod, type LossPcts } from "@/lib/erp/costing";
import { compositionLineAllowsProcess } from "@/lib/erp/ingredientSearch";
import type { ErpProduct, ErpState } from "@/lib/erp/types";
import { numText, qtyText, QtyInput, T } from "./ui";

export const methodLabel = (method: LossMethod) =>
  ({
    defrost: T("Разморозка", "Defrost", "Rã đông"),
    clean: T("Очистка", "Cleaning", "Sơ chế"),
    boil: T("Варка", "Boiling", "Luộc"),
    fry: T("Жарка", "Frying", "Chiên"),
    stew: T("Тушение", "Stewing", "Hầm"),
    bake: T("Запекание", "Baking", "Nướng"),
  })[method];

export type LossLine = { product_id: string | null; qty: number | null; methods?: LossMethod[]; net_qty?: number | null };

/** Losses only apply to weighed raw ingredients, not nested preps. */
export const hasLosses = (product: ErpProduct | undefined) => product?.base_unit === "kg" || product?.base_unit === "l";

export const canProcessProduct = (product: ErpProduct | undefined) =>
  Boolean(product && hasLosses(product) && compositionLineAllowsProcess(product.type));

const productOf = (state: ErpState, id: string | null) => (id ? state.products.find((p) => p.id === id) : undefined);

/** Typed net if set; else sequential losses; else gross. */
export const netOf = (state: ErpState, line: LossLine): number | null => {
  if (line.net_qty != null) return line.net_qty;
  if (line.qty === null) return null;
  if (!line.methods?.length) return line.qty;
  return roundQty(usableWeight(line.qty, productOf(state, line.product_id), line.methods));
};

/**
 * Brutto and netto stay independent until processing is chosen.
 * With processing, changing brutto recalculates netto from loss %.
 * Without processing, editing brutto must NOT wipe a typed netto.
 */
export function grossPatch(state: ErpState, line: LossLine, qty: number | null): Partial<LossLine> {
  const methods = line.methods ?? [];
  if (!methods.length) return { qty };
  if (qty === null) return { qty, net_qty: null };
  return { qty, net_qty: roundQty(usableWeight(qty, productOf(state, line.product_id), methods)) };
}

/**
 * Without processing: only store typed netto (or clear it so display follows brutto).
 * With processing: typed netto also back-calculates brutto from the same loss %.
 * Net 0 is a real value and must not rewrite brutto.
 */
export function netPatch(state: ErpState, line: LossLine, net: number | null): Partial<LossLine> {
  const methods = line.methods ?? [];
  if (!methods.length || net == null || net === 0) return { net_qty: net };
  const factor = netFactor(productOf(state, line.product_id), methods);
  return { net_qty: net, qty: factor > 0 ? roundQty(net / factor) : net };
}

export function methodsPatch(state: ErpState, line: LossLine, methods: LossMethod[]): Partial<LossLine> {
  return { methods, ...grossPatch(state, { ...line, methods }, line.qty) };
}

const lossOptions = (product: LossPcts | undefined, chosen: LossMethod[]) =>
  LOSS_METHODS.filter((method) => lossPct(product, method) > 0 || chosen.includes(method));

export const methodsText = (methods: LossMethod[] | undefined) =>
  methods?.length ? methods.map(methodLabel).join(", ") : "—";

export function MethodPicker({
  state,
  line,
  onChange,
  disabled,
}: {
  state: ErpState;
  line: LossLine;
  onChange: (patch: Partial<LossLine>) => void;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const product = productOf(state, line.product_id);
  const chosen = line.methods ?? [];
  const options = canProcessProduct(product) ? lossOptions(product, chosen) : [];
  const canPick = Boolean(canProcessProduct(product) && options.length && !disabled);

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

  useLayoutEffect(() => {
    if (!open || !canPick) {
      setDropUp(false);
      return;
    }
    const rootEl = root.current;
    const dropEl = dropRef.current;
    if (!rootEl || !dropEl) return;
    const rootRect = rootEl.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rootRect.bottom - gap;
    const spaceAbove = rootRect.top - gap;
    setDropUp(dropEl.offsetHeight > spaceBelow && spaceAbove > spaceBelow);
  }, [open, canPick, chosen, options.length]);

  useEffect(() => {
    if (!canPick && open) setOpen(false);
  }, [canPick, open]);

  if (!product || !canProcessProduct(product)) return <span className="erpMuted">—</span>;
  if (disabled) return <span>{methodsText(chosen)}</span>;
  if (!options.length) {
    return (
      <span className="erpMuted" title={T("Задайте потери в карточке продукта", "Set losses in the product card", "Đặt hao hụt trong thẻ sản phẩm")}>
        {T("без потерь", "no losses", "không hao hụt")}
      </span>
    );
  }

  return (
    <div className={`erpMethods${open ? " open" : ""}${dropUp ? " up" : ""}`} ref={root}>
      <button
        type="button"
        className="erpMethodsBtn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={T("Обработка", "Processing", "Sơ chế")}
        onClick={() => setOpen((value) => !value)}
      >
        {chosen.length ? methodsText(chosen) : T("выбрать", "choose", "chọn")}
      </button>
      {open ? (
        <div className="erpMethodsDrop" ref={dropRef} role="listbox">
          {options.map((method) => (
            <label key={method}>
              <input
                type="checkbox"
                checked={chosen.includes(method)}
                onChange={(event) => {
                  const next = event.target.checked ? [...chosen, method] : chosen.filter((m) => m !== method);
                  onChange(methodsPatch(state, line, LOSS_METHODS.filter((m) => next.includes(m))));
                }}
              />
              {methodLabel(method)} <span className="erpMuted">−{numText(lossPct(product, method))}%</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Net is always an input in edit mode. Processing % is optional. */
export function NetCell({
  state,
  line,
  onChange,
  disabled,
}: {
  state: ErpState;
  line: LossLine;
  onChange: (patch: Partial<LossLine>) => void;
  disabled?: boolean;
}) {
  const product = productOf(state, line.product_id);
  const unit = product?.base_unit ?? null;
  const net = netOf(state, line);
  if (disabled || !line.product_id) return <span>{qtyText(net, unit)}</span>;
  return <QtyInput base={unit} value={net} defaultSmall={unit !== "pcs"} onChange={(v) => onChange(netPatch(state, line, v))} />;
}

/** Sum of net weight over kg/l lines; pieces are counted only with a known piece weight. */
export function netWeight(state: ErpState, lines: LossLine[]): { kg: number; partial: boolean } {
  let kg = 0;
  let partial = false;
  for (const line of lines) {
    const product = productOf(state, line.product_id);
    const net = netOf(state, line);
    if (!product || net === null) continue;
    if (product.base_unit === "kg" || product.base_unit === "l") kg += net;
    else if (product.base_unit === "pcs" && product.unit_weight_kg) kg += net * product.unit_weight_kg;
    else partial = true;
  }
  return { kg: roundQty(kg), partial };
}

export const netWeightText = (weight: { kg: number; partial: boolean }) =>
  `${qtyText(weight.kg, "kg")}${weight.partial ? ` ${T("(без штучных продуктов)", "(pieces not counted)", "(chưa tính hàng cái)")}` : ""}`;

export const lossHint = () =>
  T(
    "Брутто — сколько берётся со склада. Нетто можно ввести вручную и оно может быть больше брутто (например после замачивания). Если выбрана обработка, каждый следующий % потерь считается от оставшегося веса. Себестоимость 1 кг нетто = цена покупки ÷ нетто.",
    "Gross is taken from stock. Net can be typed and may be greater than gross (for example after soaking). If processing is chosen, each next loss % applies to the remaining weight. Cost per usable kg = purchase cost ÷ net.",
    "Brutto lấy từ kho. Netto có thể nhập tay và có thể lớn hơn brutto (ví dụ sau khi ngâm). Nếu chọn sơ chế, mỗi % hao hụt sau áp vào phần còn lại. Giá 1 kg netto = giá mua ÷ netto.",
  );
