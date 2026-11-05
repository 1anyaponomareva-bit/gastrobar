/**
 * Inventory count contract used by `/api/erp/counts` and `postDocument` (type=count).
 *
 * Surplus adjustment lots take cost in this order (never invent a zero cost):
 * 1. `last_lot` — latest lot on this warehouse that has a known unit cost
 * 2. `product_reference` — `erp_products.est_unit_cost`
 * 3. `unknown` — cost stays null; stock value is incomplete
 */
export const COUNT_SURPLUS_COST_ORDER = ["last_lot", "product_reference", "unknown"] as const;

export const COUNT_ACTIONS = ["preview", "refresh", "reopen", "save", "post"] as const;
export type ErpCountApiAction = (typeof COUNT_ACTIONS)[number];
