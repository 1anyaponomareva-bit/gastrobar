/**
 * Inventory count contract used by `/api/erp/counts` and `postDocument` (type=count).
 *
 * Surplus adjustment lots take cost in this order (never invent a confirmed zero):
 * 1. `last_lot` — latest lot on this warehouse that has a known unit cost
 * 2. `product_reference` — `erp_products.est_unit_cost`
 * 3. `unknown` — `erp_receive_lot` writes `unit_cost = null` and `movements.amount = null`.
 *    `erp_stock.cost_known` is then false (known_value is only the priced remainder).
 *    `erp_movement_report` leaves in/closing value null. Unknown ≠ 0.
 *
 * Accounting already stores unknown as null, so posting is not blocked with
 * `ERP_COUNT_UNKNOWN_COST`. A missing price must not be substituted with 0.
 */
export const COUNT_SURPLUS_COST_ORDER = ["last_lot", "product_reference", "unknown"] as const;

export const COUNT_ACTIONS = ["preview", "refresh", "reopen", "save", "post"] as const;
export type ErpCountApiAction = (typeof COUNT_ACTIONS)[number];
