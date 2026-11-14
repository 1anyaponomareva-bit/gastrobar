"use client";

import { compositionYieldCost, costLine, liveCatalogName } from "@/lib/erp/costing";
import { filledParts, parseLineParts } from "@/lib/erp/lineParts";
import type { ErpRecipe, ErpState } from "@/lib/erp/types";
import { netOf } from "./losses";
import { costContextOf } from "./menuFields";
import { qtyText, T, unitLabel, unitOf, vnd } from "./ui";

export function recipeForProduct(state: ErpState, productId: string | null | undefined) {
  if (!productId) return null;
  const recipes = state.recipes.filter((recipe) => recipe.product_id === productId);
  return recipes.find((recipe) => recipe.status === "active") ?? recipes[0] ?? null;
}

export const yieldCompositionTitle = () =>
  T("Состав на нормативный выход", "Ingredients for the standard yield", "Thành phần cho sản lượng chuẩn");

/** Compact bar after composition rows: normative yield + cost of that yield (gross line costs). */
export function YieldCostFooter({
  colSpan,
  yieldText,
  cost,
  perUnit,
}: {
  colSpan: number;
  yieldText: string;
  cost: number | null;
  perUnit?: string | null;
}) {
  return (
    <tfoot>
      <tr className="erpYieldCostRow">
        <td colSpan={colSpan} className="erpYieldCostCell">
          <div className="erpYieldCostBar">
            <span className="erpYieldCostYield">
              {T("Вес готового / выход", "Finished yield", "Thành phẩm / sản lượng")}: <strong>{yieldText}</strong>
            </span>
            <span className="erpYieldCostMoney">
              {T("Себестоимость выхода", "Cost of the yield", "Giá vốn sản lượng")}:{" "}
              <strong>{cost === null ? T("неполная", "incomplete", "chưa đủ") : vnd(cost)}</strong>
              {cost !== null && perUnit ? <span className="erpMuted"> · {perUnit}</span> : null}
            </span>
          </div>
        </td>
      </tr>
    </tfoot>
  );
}

export function yieldDisplayText(
  yieldQty: number | null | undefined,
  unit: string | null | undefined,
  yieldPieces?: number | null,
) {
  if (!yieldQty) return "—";
  const main = qtyText(yieldQty, unit);
  return yieldPieces && unit !== "pcs" ? `${main} · ${yieldPieces} ${unitLabel("pcs")}` : main;
}

export function yieldPerUnitText(cost: number | null, yieldQty: number | null | undefined, unit: string | null | undefined, yieldPieces?: number | null) {
  if (cost === null || !yieldQty) return null;
  const bits = [`${vnd(cost / yieldQty)} / ${unitLabel(unit)}`];
  if (yieldPieces && unit !== "pcs") bits.push(`${vnd(cost / yieldPieces)} / ${unitLabel("pcs")}`);
  return bits.join(" · ");
}

/** Prep-recipe lines for the standard yield, used in list expanders and nested under tech cards. */
export function YieldComposition({
  state,
  recipe,
  heading = true,
}: {
  state: ErpState;
  recipe: ErpRecipe | null | undefined;
  heading?: boolean;
}) {
  const ctx = costContextOf(state);
  const title = yieldCompositionTitle();
  if (!recipe?.lines.length) {
    return (
      <div className="erpMenuUsageBlock">
        {heading ? <h3>{title}</h3> : null}
        <p className="erpHint">{T("Состав ещё не заполнен", "Composition is empty", "Chưa có thành phần")}</p>
      </div>
    );
  }
  const product = state.products.find((item) => item.id === recipe.product_id);
  const yieldUnit = product?.base_unit ?? null;
  const yieldCost = compositionYieldCost(ctx, recipe.lines);
  return (
    <div className="erpMenuUsageBlock">
      {heading ? <h3>{title}</h3> : null}
      <div className="erpTableWrap erpYieldWrap">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{T("Ингредиент", "Ingredient", "Nguyên liệu")}</th>
              <th className="num">{T("Брутто", "Gross", "Brutto")}</th>
              <th className="num">{T("Нетто", "Net", "Netto")}</th>
              <th className="num">{T("Себестоимость", "Cost", "Giá vốn")}</th>
            </tr>
          </thead>
          <tbody>
            {recipe.lines.map((line, index) => {
              const unit = unitOf(state, line.product_id);
              const net = netOf(state, line);
              const cost = line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty).cost : null;
              const prep = state.products.find((item) => item.id === line.product_id)?.type === "semi_finished";
              const cuts = filledParts(parseLineParts(line.parts));
              const small = unit === "l" ? T("мл", "ml", "ml") : T("г", "g", "g");
              return (
                <tr key={line.id || index}>
                  <td>
                    {line.is_main ? <span className="erpMainMark" aria-hidden>★ </span> : null}
                    {liveCatalogName(state.products, line.product_id)}
                    {prep ? <span className="erpMuted"> {T("(п/ф)", "(prep)", "(bán TP)")}</span> : null}
                    {cuts.length ? (
                      <ul className="erpLinePartsList">
                        {cuts.map((part, partIndex) => (
                          <li key={partIndex}>
                            {part.name} · {part.grams} {small}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="num">{qtyText(line.qty, unit)}</td>
                  <td className="num">{net == null || (unit === "pcs" && net === 0) ? "—" : qtyText(net, unit)}</td>
                  <td className="num">{cost == null ? "—" : vnd(cost)}</td>
                </tr>
              );
            })}
          </tbody>
          <YieldCostFooter
            colSpan={4}
            yieldText={yieldDisplayText(recipe.yield_qty, yieldUnit, recipe.yield_pieces)}
            cost={yieldCost}
            perUnit={yieldPerUnitText(yieldCost, recipe.yield_qty, yieldUnit, recipe.yield_pieces)}
          />
        </table>
      </div>
    </div>
  );
}
