import type {
  FinanceAccount,
  FinanceCategory,
  FinanceEmployee,
  FinancePayroll,
  FinanceShift,
  FinanceTransaction,
} from "./finance";
import type { ErpLegalEntity, ErpSalesDocument, ErpSalesLine, ErpSalesSourceLink } from "./sales";
import type {
  ErpDish,
  ErpDocument,
  ErpLocation,
  ErpProductCostQuote,
  ErpRecipe,
  ErpRecipeLine,
  ErpState,
  ErpTaxRate,
  ErpVatException,
} from "./types";
import { check, erpDb } from "./server";

/** Parts of the ERP screen data that can be loaded on their own. */
export type StatePart = keyof ErpState;

export const ALL_PARTS: StatePart[] = [
  "settings",
  "categories",
  "suppliers",
  "warehouses",
  "locations",
  "channels",
  "products",
  "packs",
  "productPacks",
  "stock",
  "recipes",
  "dishes",
  "writeoffReasons",
  "costSources",
  "financeAccounts",
  "financeCategories",
  "financeTransactions",
  "financeShifts",
  "financeEmployees",
  "financePayroll",
  "legalEntities",
  "salesDocuments",
  "salesLines",
  "salesSourceLinks",
  "inputVatCategories",
  "taxInvoices",
  "expenseDocuments",
  "platformAccounts",
  "platformImportBatches",
  "platformSettlements",
  "platformSettlementLines",
  "platformPayouts",
  "platformReconciliation",
  "vatSettlements",
  "vatCarryforwards",
  "vatPayments",
  "vatPeriodCorrections",
  "salesPendingCogs",
  "salesBomSnapshots",
  "expensePayments",
  "payrollAccruals",
  "fixedAssets",
  "apArItems",
  "financialPeriods",
  "periodClosings",
  "periodCloseChecks",
  "periodSnapshots",
  "periodReopenRequests",
  "financialCorrections",
  "auditLog",
  "vatExceptions",
  "taxRates",
];

/** Warehouse screens need these before recipes/dishes. First paint still uses ALL_PARTS: after `erp_load_state` that is one SQL; splitting would add a second round trip. */
export const STOCK_SHELL_PARTS: StatePart[] = ["settings", "categories", "suppliers", "warehouses", "channels", "products", "packs", "productPacks", "stock", "writeoffReasons", "vatExceptions", "taxRates"];

const MISSING_FN = new Set(["PGRST202", "42883"]);
/** Skip a missing RPC for a while, then try again (migration may land after the first warm instance). */
let loadStateRpcMissingUntil = 0;
const LOAD_STATE_RETRY_MS = 60_000;

function isMissingLoadState(code: string, message: string) {
  return MISSING_FN.has(code) || /erp_load_state|does not exist|could not find the function/i.test(message);
}

function markLoadStateMissing() {
  loadStateRpcMissingUntil = Date.now() + LOAD_STATE_RETRY_MS;
}

function optionalTable<T>(result: { data: unknown; error: { code?: string; message?: string } | null }, fallback: T): T {
  if (result.error) {
    const code = result.error.code ?? "";
    const message = result.error.message ?? "";
    if (["PGRST205", "PGRST202", "42P01", "42883"].includes(code) || /does not exist|could not find/i.test(message)) {
      return fallback;
    }
    check(result);
  }
  return (result.data ?? fallback) as T;
}

async function loadStateRpc(parts: StatePart[]): Promise<Partial<ErpState> | null> {
  if (Date.now() < loadStateRpcMissingUntil) return null;
  try {
    const result = await erpDb().rpc("erp_load_state", { p_parts: parts.join(",") });
    if (result.error) {
      const message = result.error.message ?? "";
      if (isMissingLoadState(result.error.code ?? "", message)) {
        markLoadStateMissing();
        return null;
      }
      check(result);
    }
    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    loadStateRpcMissingUntil = 0;
    return data as Partial<ErpState>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingLoadState("", message)) {
      markLoadStateMissing();
      return null;
    }
    throw error;
  }
}

async function loadPart(part: StatePart): Promise<unknown> {
  const db = erpDb();
  switch (part) {
    case "settings":
      return check(await db.from("erp_settings").select("*").eq("id", 1).single());
    case "categories":
      return check(await db.from("erp_categories").select("*").order("sort"));
    case "suppliers":
      return check(await db.from("erp_suppliers").select("*").order("sort"));
    case "warehouses":
      return check(await db.from("erp_warehouses").select("*").order("sort"));
    case "locations": {
      const result = await db.from("erp_locations").select("*").order("name");
      if (result.error) {
        const code = result.error.code ?? "";
        const message = result.error.message ?? "";
        if (["PGRST205", "PGRST202", "42P01", "42883"].includes(code) || /does not exist|could not find/i.test(message)) {
          return [] as ErpLocation[];
        }
        check(result);
      }
      return (result.data ?? []) as ErpLocation[];
    }
    case "channels":
      return check(await db.from("erp_sales_channels").select("*").order("sort"));
    case "products":
      return check(await db.from("erp_products").select("*").order("name_en").limit(5000));
    case "packs":
      return check(await db.from("erp_packs").select("*").is("archived_at", null).limit(10000));
    case "productPacks":
      return check(await db.from("erp_product_packs").select("*").is("archived_at", null).limit(10000));
    case "stock":
      return check(await db.from("erp_stock").select("*").limit(20000));
    case "writeoffReasons":
      return check(await db.from("erp_writeoff_reasons").select("*").order("sort"));
    case "recipes": {
      const [recipes, lines] = await Promise.all([
        db.from("erp_recipes").select("*").order("version"),
        db.from("erp_recipe_lines").select("*").order("line_no").limit(20000),
      ]);
      const byRecipe = new Map<string, ErpRecipeLine[]>();
      for (const line of check(lines) as ErpRecipeLine[]) {
        const list = byRecipe.get(line.recipe_id);
        if (list) list.push(line);
        else byRecipe.set(line.recipe_id, [line]);
      }
      return (check(recipes) as Omit<ErpRecipe, "lines">[]).map((recipe) => ({ ...recipe, lines: byRecipe.get(recipe.id) ?? [] }));
    }
    case "costSources": {
      const result = await db.from("erp_product_cost_quotes_view").select("*").limit(5000);
      if (result.error) {
        const code = result.error.code ?? "";
        const message = result.error.message ?? "";
        if (["PGRST205", "PGRST202", "42P01", "42883"].includes(code) || /does not exist|could not find/i.test(message)) return [] as ErpProductCostQuote[];
        check(result);
      }
      return (result.data ?? []) as ErpProductCostQuote[];
    }
    case "financeAccounts":
      return optionalTable(await db.from("erp_finance_accounts").select("*").order("sort"), [] as FinanceAccount[]);
    case "financeCategories":
      return optionalTable(await db.from("erp_finance_categories").select("*").order("sort"), [] as FinanceCategory[]);
    case "financeTransactions":
      return optionalTable(
        await db.from("erp_finance_transactions").select("*").order("occurred_at", { ascending: false }).limit(10000),
        [] as FinanceTransaction[],
      );
    case "financeShifts":
      return optionalTable(
        await db.from("erp_finance_shifts").select("*").order("opened_at", { ascending: false }).limit(2000),
        [] as FinanceShift[],
      );
    case "financeEmployees":
      return optionalTable(await db.from("erp_finance_employees").select("*").order("name"), [] as FinanceEmployee[]);
    case "financePayroll":
      return optionalTable(
        await db.from("erp_finance_payroll").select("*").order("period_end", { ascending: false }).limit(2000),
        [] as FinancePayroll[],
      );
    case "legalEntities":
      return optionalTable(await db.from("erp_legal_entities").select("*").eq("is_active", true).order("code"), [] as ErpLegalEntity[]);
    case "salesDocuments":
      return optionalTable(
        await db.from("erp_sales_documents").select("*").is("deleted_at", null).order("business_date", { ascending: false }).limit(3000),
        [] as ErpSalesDocument[],
      );
    case "salesLines":
      return optionalTable(
        await db.from("erp_sales_lines").select("*").order("document_id").order("line_no").limit(20000),
        [] as ErpSalesLine[],
      );
    case "salesSourceLinks":
      return optionalTable(
        await db.from("erp_sales_source_links").select("*").order("created_at", { ascending: false }).limit(10000),
        [] as ErpSalesSourceLink[],
      );
    case "inputVatCategories":
      return optionalTable(
        await db.from("erp_input_vat_categories").select("*").eq("is_active", true).order("sort"),
        [],
      );
    case "taxInvoices":
      return optionalTable(
        await db.from("erp_tax_invoices").select("*").is("deleted_at", null).order("invoice_date", { ascending: false }).limit(3000),
        [],
      );
    case "expenseDocuments":
      return optionalTable(
        await db.from("erp_expense_documents").select("*").is("deleted_at", null).order("transaction_date", { ascending: false }).limit(3000),
        [],
      );
    case "platformAccounts":
      return optionalTable(
        await db.from("erp_platform_accounts").select("*").eq("is_active", true).order("platform_code").order("display_name"),
        [],
      );
    case "platformImportBatches":
      return optionalTable(
        await db.from("erp_platform_import_batches").select("*").order("created_at", { ascending: false }).limit(500),
        [],
      );
    case "platformSettlements":
      return optionalTable(
        await db.from("erp_platform_settlements").select("*").neq("status", "cancelled").order("created_at", { ascending: false }).limit(500),
        [],
      );
    case "platformSettlementLines":
      return optionalTable(
        await db.from("erp_platform_settlement_lines").select("*").order("created_at", { ascending: false }).limit(20000),
        [],
      );
    case "platformPayouts":
      return optionalTable(
        await db.from("erp_platform_payouts").select("*").neq("status", "cancelled").order("payout_date", { ascending: false }).limit(500),
        [],
      );
    case "platformReconciliation":
      return optionalTable(
        await db.from("erp_platform_reconciliation").select("*").order("created_at", { ascending: false }).limit(5000),
        [],
      );
    case "vatSettlements":
      return optionalTable(
        await db.from("erp_vat_settlements").select("*").order("period_end", { ascending: false }).limit(500),
        [],
      );
    case "vatCarryforwards":
      return optionalTable(
        await db.from("erp_vat_carryforwards").select("*").order("created_at", { ascending: false }).limit(500),
        [],
      );
    case "vatPayments":
      return optionalTable(
        await db.from("erp_vat_payments").select("*").neq("status", "cancelled").order("payment_date", { ascending: false }).limit(500),
        [],
      );
    case "vatPeriodCorrections":
      return optionalTable(
        await db.from("erp_vat_period_corrections").select("*").order("created_at", { ascending: false }).limit(500),
        [],
      );
    case "salesPendingCogs":
      return optionalTable(
        await db.from("erp_sales_pending_cogs").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(2000),
        [],
      );
    case "salesBomSnapshots":
      return optionalTable(
        await db.from("erp_sales_bom_snapshots").select("*").order("exploded_at", { ascending: false }).limit(2000),
        [],
      );
    case "expensePayments":
      return optionalTable(
        await db.from("erp_expense_payments").select("*").neq("status", "cancelled").order("payment_date", { ascending: false }).limit(2000),
        [],
      );
    case "payrollAccruals":
      return optionalTable(
        await db.from("erp_payroll_accruals").select("*").order("period_end", { ascending: false }).limit(2000),
        [],
      );
    case "fixedAssets":
      return optionalTable(
        await db.from("erp_fixed_assets").select("*").neq("status", "cancelled").order("acquisition_date", { ascending: false }).limit(2000),
        [],
      );
    case "apArItems":
      return optionalTable(
        await db.from("erp_ap_ar_items").select("*").in("status", ["open", "partial"]).order("due_date", { ascending: true }).limit(5000),
        [],
      );
    case "financialPeriods":
      return optionalTable(
        await db.from("erp_financial_periods").select("*").order("period_end", { ascending: false }).limit(500),
        [],
      );
    case "periodClosings":
      return optionalTable(
        await db.from("erp_period_closings").select("*").order("closed_at", { ascending: false }).limit(500),
        [],
      );
    case "periodCloseChecks":
      return optionalTable(
        await db.from("erp_period_close_checks").select("*").order("created_at", { ascending: false }).limit(5000),
        [],
      );
    case "periodSnapshots":
      return optionalTable(
        await db
          .from("erp_period_snapshots")
          .select(
            "id,period_id,closing_id,report_kind,report_version,calculation_at,applied_rules,data_completeness,closed_by,created_at,payload",
          )
          .order("report_version", { ascending: false })
          .limit(2000),
        [],
      );
    case "periodReopenRequests":
      return optionalTable(
        await db.from("erp_period_reopen_requests").select("*").order("requested_at", { ascending: false }).limit(500),
        [],
      );
    case "financialCorrections":
      return optionalTable(
        await db.from("erp_financial_corrections").select("*").order("created_at", { ascending: false }).limit(1000),
        [],
      );
    case "auditLog":
      return optionalTable(
        await db.from("erp_audit_log").select("*").order("at", { ascending: false }).limit(2000),
        [],
      );
    case "vatExceptions":
      return optionalTable(await db.from("erp_vat_exceptions").select("*"), [] as ErpVatException[]);
    case "taxRates":
      return optionalTable(await db.from("erp_tax_rates").select("*").order("sort"), [] as ErpTaxRate[]);
    case "dishes": {
      const [dishes, lines, prices] = await Promise.all([
        db.from("erp_dishes").select("*").order("name_en"),
        db.from("erp_dish_lines").select("*").order("line_no").limit(20000),
        db.from("erp_dish_channel_prices").select("*"),
      ]);
      const linesByDish = new Map<string, ErpDish["lines"]>();
      for (const line of check(lines) as (ErpDish["lines"][number] & { dish_id: string })[]) {
        const list = linesByDish.get(line.dish_id);
        if (list) list.push(line);
        else linesByDish.set(line.dish_id, [line]);
      }
      const pricesByDish = new Map<string, ErpDish["channel_prices"]>();
      for (const price of check(prices) as (ErpDish["channel_prices"][number] & { dish_id: string })[]) {
        const list = pricesByDish.get(price.dish_id);
        if (list) list.push(price);
        else pricesByDish.set(price.dish_id, [price]);
      }
      return (check(dishes) as Omit<ErpDish, "lines" | "channel_prices">[]).map((dish) => ({
        ...dish,
        lines: linesByDish.get(dish.id) ?? [],
        channel_prices: pricesByDish.get(dish.id) ?? [],
      }));
    }
  }
}

/** One document with its lines, or null. */
export async function loadDocument(id: string): Promise<ErpDocument | null> {
  const db = erpDb();
  const [document, lines, acquisition] = await Promise.all([
    db.from("erp_documents").select("*").eq("id", id).maybeSingle(),
    db.from("erp_document_lines").select("*").eq("document_id", id).order("line_no"),
    db.from("erp_document_acquisition_costs").select("*").eq("document_id", id),
  ]);
  const doc = check(document) as Omit<ErpDocument, "lines"> | null;
  if (!doc) return null;
  // Acquisition table is Phase 8C — ignore until migration is applied.
  const acquisition_costs =
    !acquisition.error && Array.isArray(acquisition.data)
      ? (acquisition.data as NonNullable<ErpDocument["acquisition_costs"]>)
      : undefined;
  return {
    ...doc,
    lines: check(lines),
    ...(acquisition_costs && acquisition_costs.length ? { acquisition_costs } : {}),
  };
}

/**
 * Screen payload: one SQL function when `erp_load_state` exists, otherwise one PostgREST
 * call per part in parallel (recipes and dishes each add nested lookups).
 */
export async function loadState(parts: StatePart[] = ALL_PARTS): Promise<Partial<ErpState>> {
  const batched = await loadStateRpc(parts);
  if (batched) {
    if (parts.includes("costSources") && batched.costSources === undefined) {
      batched.costSources = (await loadPart("costSources")) as ErpProductCostQuote[];
    }
    if (parts.includes("locations") && batched.locations === undefined) {
      batched.locations = (await loadPart("locations")) as ErpLocation[];
    }
    if (parts.includes("vatExceptions") && batched.vatExceptions === undefined) {
      batched.vatExceptions = (await loadPart("vatExceptions")) as ErpVatException[];
    }
    if (parts.includes("taxRates") && batched.taxRates === undefined) {
      batched.taxRates = (await loadPart("taxRates")) as ErpTaxRate[];
    }
    const financeParts = [
      "financeAccounts",
      "financeCategories",
      "financeTransactions",
      "financeShifts",
      "financeEmployees",
      "financePayroll",
    ] as const;
    for (const part of financeParts) {
      if (parts.includes(part) && batched[part] === undefined) {
        (batched as Record<string, unknown>)[part] = await loadPart(part);
      }
    }
    return batched;
  }
  const values = await Promise.all(parts.map(loadPart));
  return Object.fromEntries(parts.map((part, index) => [part, values[index]])) as Partial<ErpState>;
}
