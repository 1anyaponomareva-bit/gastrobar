"use client";

import { LOSS_METHODS, lossPct, netFactor, roundQty, type LossMethod, type LossPcts } from "@/lib/erp/costing";
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

/** Losses only apply to weighed products. */
export const hasLosses = (product: ErpProduct | undefined) => product?.base_unit === "kg" || product?.base_unit === "l";

const productOf = (state: ErpState, id: string | null) => (id ? state.products.find((p) => p.id === id) : undefined);

/** Net is stored only when a method is chosen; without methods net = gross. */
export const netOf = (state: ErpState, line: LossLine): number | null => {
  if (line.qty === null) return null;
  if (!line.methods?.length) return line.qty;
  return line.net_qty ?? roundQty(line.qty * netFactor(productOf(state, line.product_id), line.methods));
};

export function grossPatch(state: ErpState, line: LossLine, qty: number | null): Partial<LossLine> {
  const methods = line.methods ?? [];
  if (!methods.length || qty === null) return { qty, net_qty: null };
  return { qty, net_qty: roundQty(qty * netFactor(productOf(state, line.product_id), methods)) };
}

export function netPatch(state: ErpState, line: LossLine, net: number | null): Partial<LossLine> {
  const factor = netFactor(productOf(state, line.product_id), line.methods ?? []);
  if (net === null) return { net_qty: null };
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
  const product = productOf(state, line.product_id);
  const chosen = line.methods ?? [];
  if (!product || !hasLosses(product)) return <span className="erpMuted">—</span>;
  const options = lossOptions(product, chosen);
  if (disabled) return <span>{methodsText(chosen)}</span>;
  if (!options.length) {
    return (
      <span className="erpMuted" title={T("Задайте потери в карточке продукта", "Set losses in the product card", "Đặt hao hụt trong thẻ sản phẩm")}>
        {T("без потерь", "no losses", "không hao hụt")}
      </span>
    );
  }
  return (
    <details className="erpMethods">
      <summary>{chosen.length ? methodsText(chosen) : T("выбрать", "choose", "chọn")}</summary>
      <div>
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
    </details>
  );
}

/** Net input when a method is chosen, otherwise net equals gross and is only shown. */
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
  if (disabled || !line.methods?.length || !line.product_id) return <span>{qtyText(net, unit)}</span>;
  return <QtyInput base={unit} value={net} defaultSmall onChange={(v) => onChange(netPatch(state, line, v))} />;
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
    "Брутто — сколько берётся со склада, нетто — что остаётся после обработки. Себестоимость считается по брутто.",
    "Gross is taken from stock, net is what is left after processing. Cost is based on gross.",
    "Brutto lấy từ kho, netto là phần còn lại sau sơ chế. Giá vốn tính theo brutto.",
  );
