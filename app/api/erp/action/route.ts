import { after } from "next/server";
import { extraNamesOnly, langMapGet } from "@/lib/erp/contentLang";
import {
  POSTER_ERP_SYNC_FORBIDDEN_CODE,
  POSTER_ERP_SYNC_FORBIDDEN_DETAIL,
  wouldSyncPosterToErp,
} from "@/lib/erp/posterErpSyncForbidden";
import { setProductPrepStockListed, syncPrepStockFromErpProduct } from "@/lib/erp/prepStock";
import { publishPrepStateToStaff, publishProductPrepToStaff } from "@/lib/erp/publishPrepToStaff";
import { check, erpDb, ErpHttpError, requireAdmin, rpc as rawRpc, ServerTiming } from "@/lib/erp/server";
import { loadDocument, loadState, type StatePart } from "@/lib/erp/stateLoader";
import type { ErpAction } from "@/lib/erp/types";
import { mergeOldStaffCatalog, refreshStaffMirror } from "@/lib/erp/staffCatalogSource";

function assertPosterErpSyncAllowed(input: {
  source_system?: unknown;
  source?: unknown;
  poster_payload?: unknown;
  live_fetch?: unknown;
  auto_sync?: unknown;
}) {
  if (wouldSyncPosterToErp(input)) {
    throw new ErpHttpError(403, POSTER_ERP_SYNC_FORBIDDEN_CODE, POSTER_ERP_SYNC_FORBIDDEN_DETAIL);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const REF_ENTITIES = new Set(["category", "supplier", "warehouse", "channel"]);
const CATALOG_ENTITIES = new Set(["product", "category", "supplier"]);
const ARCHIVE_ENTITIES = new Set(["product", "category", "supplier", "warehouse", "channel", "dish", "pack"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Screen data each entity lives in. */
const ENTITY_PART: Record<string, StatePart> = {
  product: "products",
  category: "categories",
  supplier: "suppliers",
  warehouse: "warehouses",
  location: "locations",
  channel: "channels",
  dish: "dishes",
  pack: "packs",
};
/** Posting and cancelling move lots and may update product costs. */
const STOCK_PARTS: StatePart[] = ["stock", "products", "costSources"];
const FINANCE_PARTS: StatePart[] = [
  "financeAccounts",
  "financeCategories",
  "financeTransactions",
  "financeShifts",
  "financeEmployees",
  "financePayroll",
];
const SALES_PARTS: StatePart[] = [
  "legalEntities",
  "salesDocuments",
  "salesLines",
  "salesSourceLinks",
  "settings",
  "channels",
  "locations",
  "warehouses",
  "dishes",
  "products",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ErpHttpError(400, "ERP_INVALID", "id");
  return value;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!isObject(value)) throw new ErpHttpError(400, "ERP_INVALID", name);
  return value;
}

async function applyExtraNames(
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>,
  kind: "product" | "dish" | "category",
  id: string,
  payload: Record<string, unknown>,
) {
  if (!Object.prototype.hasOwnProperty.call(payload, "names")) return;
  const extra = extraNamesOnly(isObject(payload.names) ? (payload.names as Record<string, string>) : {});
  try {
    await rpc("erp_set_extra_names", { p_kind: kind, p_id: id, p_names: extra });
  } catch (error) {
    // Extra-language SQL is additive and may lag the app. Do not block EN/VN save.
    if (error instanceof ErpHttpError && error.code === "ERP_NOT_INSTALLED") return;
    throw error;
  }
}

/** Accountable Item + structured Orders packing — columns may lag behind erp_save_product. */
async function applyOrdersCatalogFields(
  id: string,
  payload: Record<string, unknown>,
  actor: string,
) {
  const patch: Record<string, unknown> = { updated_by: actor };
  const staff = isObject(payload.staff) ? payload.staff : null;
  if (staff && Object.prototype.hasOwnProperty.call(staff, "listed")) {
    patch.staff_listed = Boolean(staff.listed);
  } else if (Object.prototype.hasOwnProperty.call(payload, "staff_listed")) {
    patch.staff_listed = Boolean(payload.staff_listed);
  } else if (Object.prototype.hasOwnProperty.call(payload, "accountable")) {
    patch.staff_listed = Boolean(payload.accountable);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "order_pack_type")) {
    const raw = payload.order_pack_type;
    patch.order_pack_type = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "order_pack_content_qty")) {
    const raw = payload.order_pack_content_qty;
    const n = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    patch.order_pack_content_qty = n != null && Number.isFinite(n) && n > 0 ? n : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "order_pack_content_unit")) {
    const raw = payload.order_pack_content_unit;
    patch.order_pack_content_unit = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }

  if (Object.keys(patch).length <= 1) return;
  const result = await erpDb().from("erp_products").update(patch).eq("id", id);
  if (result.error) {
    if (["PGRST204", "PGRST205", "42703"].includes(result.error.code ?? "")) return;
    throw check(result);
  }
}

/**
 * Older live SQL still drops typed net on nested prep SKUs.
 * Net may be greater than brutto (soak / cook gain) — that is allowed.
 * Re-apply payload nets by line_no after save so the card keeps what was typed.
 */
async function applyTypedLineNets(
  table: "erp_recipe_lines" | "erp_dish_lines",
  parentColumn: "recipe_id" | "dish_id",
  parentId: string,
  payload: Record<string, unknown>,
) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const db = erpDb();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isObject(line) || !Object.prototype.hasOwnProperty.call(line, "net_qty")) continue;
    const raw = line.net_qty;
    const net =
      raw === null || raw === undefined || raw === ""
        ? null
        : Number(raw);
    if (net !== null && !Number.isFinite(net)) continue;
    check(
      await db
        .from(table)
        .update({ net_qty: net })
        .eq(parentColumn, parentId)
        .eq("line_no", index + 1),
    );
  }
}

/**
 * All ERP writes. Every action requires an admin session; the email is stored as the author.
 * Responses carry `patch` — the screen data the action changed, read after the write — and, for
 * documents, the saved `document`, so the client needs no follow-up requests. Actions without a
 * `patch` change too much; the client reloads everything.
 */
export async function POST(request: Request) {
  const timing = new ServerTiming();
  const rpc = <T = unknown>(fn: string, args: Record<string, unknown>) => timing.time("db", rawRpc<T>(fn, args));
  const fresh = (parts: StatePart[]) => timing.time("db", loadState(parts));
  const freshDocument = (id: string) => timing.time("db", loadDocument(id));
  // The Staff rollback copy is refreshed after the response; failures there are only logged.
  const mirrorStaffLater = () => after(() => refreshStaffMirror());
  try {
    const actor = await timing.time("auth", requireAdmin());
    const body = (await request.json().catch(() => null)) as ErpAction | null;
    if (!isObject(body)) throw new ErpHttpError(400, "ERP_INVALID", "body");
    const a = body as ErpAction;

    switch (a.action) {
      case "setPrepStockListed": {
        const id = String(a.id || "").trim();
        if (!UUID.test(id)) throw new ErpHttpError(400, "ERP_INVALID", "id");
        const listed = Boolean(a.listed);
        const saved = await setProductPrepStockListed({ productId: id, listed, actor });
        const patch = await fresh(["products"]);
        return timing.json({ id: saved.id, staff_listed: saved.staff_listed, patch });
      }
      case "saveProduct": {
        const payload = object(a.product, "product");
        const id = await rpc<string>("erp_save_product", { p: payload, p_actor: actor });
        await applyExtraNames(rpc, "product", id, payload);
        await applyOrdersCatalogFields(id, payload, actor);
        const staff = isObject(payload.staff) ? payload.staff : null;
        const listed =
          staff && Object.prototype.hasOwnProperty.call(staff, "listed")
            ? Boolean(staff.listed)
            : Object.prototype.hasOwnProperty.call(payload, "staff_listed")
              ? Boolean(payload.staff_listed)
              : Object.prototype.hasOwnProperty.call(payload, "accountable")
                ? Boolean(payload.accountable)
                : null;
        if (listed !== null) {
          const names = isObject(payload.names) ? (payload.names as Record<string, string>) : {};
          try {
            await syncPrepStockFromErpProduct({
              productId: id,
              listed,
              nameEn: String(payload.name_en ?? ""),
              nameRu: langMapGet(names, "ru"),
              nameVn: String(payload.name_vn ?? ""),
              actor,
            });
          } catch (error) {
            if (!(error instanceof ErpHttpError && error.code === "ERP_NOT_INSTALLED")) throw error;
          }
        }
        mirrorStaffLater();
        const patch = await fresh(["products", "packs", "productPacks", "recipes", "costSources"]);
        const product = patch.products?.find((row) => row.id === id);
        if (product && (product.type === "semi_finished" || product.type === "finished")) {
          await publishProductPrepToStaff(id, { recipes: patch.recipes ?? [], products: patch.products ?? [] });
        }
        return timing.json({
          id,
          patch: {
            products: patch.products,
            packs: patch.packs,
            productPacks: patch.productPacks,
            costSources: patch.costSources,
          },
        });
      }
      case "savePack": {
        const id = await rpc("erp_save_pack", { p: object(a.pack, "pack"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["packs", "productPacks"]) });
      }
      case "setArchived":
        if (!ARCHIVE_ENTITIES.has(a.entity)) throw new ErpHttpError(400, "ERP_INVALID", "entity");
        await rpc("erp_set_archived", { p_entity: a.entity, p_id: uuid(a.id), p_archived: a.archived === true, p_actor: actor });
        if (CATALOG_ENTITIES.has(a.entity)) mirrorStaffLater();
        return timing.json({
          ok: true,
          patch: await fresh(a.entity === "pack" ? ["packs", "productPacks"] : [ENTITY_PART[a.entity]]),
        });
      case "saveRef":
        if (!REF_ENTITIES.has(a.entity)) throw new ErpHttpError(400, "ERP_INVALID", "entity");
        {
          const value = object(a.value, "value");
          const id = await rpc<string>("erp_save_ref", { p_entity: a.entity, p: value, p_actor: actor });
          if (a.entity === "category") await applyExtraNames(rpc, "category", id, value);
          if (CATALOG_ENTITIES.has(a.entity)) mirrorStaffLater();
          return timing.json({ id, patch: await fresh([ENTITY_PART[a.entity]]) });
        }
      case "saveLocation": {
        const id = await rpc("erp_save_location", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["locations"]) });
      }
      case "deleteLocation":
        await rpc("erp_delete_location", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(["locations"]) });
      case "deleteCategory":
        await rpc("erp_purge_deleted_categories", { p_actor: actor });
        await rpc("erp_delete_category", { p_id: uuid(a.id), p_actor: actor });
        if (CATALOG_ENTITIES.has("category")) mirrorStaffLater();
        return timing.json({ ok: true, patch: await fresh(["categories"]) });
      case "restoreCategory":
        await rpc("erp_purge_deleted_categories", { p_actor: actor });
        await rpc("erp_restore_category", { p_id: uuid(a.id), p_actor: actor });
        if (CATALOG_ENTITIES.has("category")) mirrorStaffLater();
        return timing.json({ ok: true, patch: await fresh(["categories"]) });
      case "purgeCategoryTrash":
        await rpc("erp_purge_deleted_categories", { p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(["categories", "products"]) });
      case "saveSettings":
        await rpc("erp_save_settings", { p: object(a.settings, "settings"), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(["settings", "vatExceptions", "taxRates"]) });
      case "saveTaxRate": {
        const id = await rpc("erp_save_tax_rate", { p: object(a.taxRate, "taxRate"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["taxRates", "settings"]) });
      }
      case "saveVatException":
        await rpc("erp_save_vat_exception", { p: object(a.exception, "exception"), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(["vatExceptions"]) });
      case "deleteVatException":
        if (a.id) {
          await rpc("erp_delete_vat_exception_id", { p_id: uuid(a.id), p_actor: actor });
        } else {
          await rpc("erp_delete_vat_exception", { p_product: uuid(a.productId), p_actor: actor });
        }
        return timing.json({ ok: true, patch: await fresh(["vatExceptions"]) });
      case "saveWriteoffReason": {
        const id = await rpc("erp_save_writeoff_reason", { p: object(a.reason, "reason"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["writeoffReasons"]) });
      }
      case "saveDocument": {
        const id = await rpc<string>("erp_save_document", { p_doc: object(a.document, "document"), p_actor: actor });
        return timing.json({ id, document: await freshDocument(id), patch: {} });
      }
      case "postDocument": {
        // Saving the edited draft and posting it is one request; each step keeps all its checks
        // and its own transaction, as when they were sent separately.
        const id = a.document
          ? await rpc<string>("erp_save_document", { p_doc: object(a.document, "document"), p_actor: actor })
          : uuid(a.id);
        let result: unknown;
        try {
          const linked = check(
            await erpDb().from("erp_documents").select("source_order_id").eq("id", id).maybeSingle(),
          ) as { source_order_id?: string | null } | null;
          result = linked?.source_order_id
            ? await rpc("erp_order_admin_post", { p_id: id, p_actor: actor, p_admin: true })
            : await rpc("erp_post_document", { p_id: id, p_actor: actor });
        } catch (error) {
          if (a.document && error instanceof ErpHttpError) {
            error.extra = { id, document: await freshDocument(id).catch(() => null) };
          }
          throw error;
        }
        const [document, patch] = await Promise.all([freshDocument(id), fresh(STOCK_PARTS)]);
        return timing.json({ id, result, document, patch });
      }
      case "cancelDocument": {
        const id = uuid(a.id);
        const result = await rpc("erp_cancel_document", { p_id: id, p_actor: actor, p_reason: String(a.reason ?? "") });
        const [document, patch] = await Promise.all([freshDocument(id), fresh(STOCK_PARTS)]);
        return timing.json({ result, document, patch });
      }
      case "deleteDraft":
        await rpc("erp_delete_draft", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: {} });
      case "previewVatAdjustment": {
        const preview = await rpc("erp_vat_adj_preview", { p: object(a.preview, "preview") });
        return timing.json({ preview });
      }
      case "saveVatAdjustment": {
        const id = await rpc<string>("erp_vat_adj_save", { p: object(a.adjustment, "adjustment"), p_actor: actor });
        return timing.json({ id });
      }
      case "postVatAdjustment": {
        const id = uuid(a.id);
        const result = await rpc("erp_vat_adj_post", {
          p_id: id,
          p_actor: actor,
          p_preview_hash: a.previewHash ?? null,
        });
        return timing.json({ id, result, patch: await fresh(STOCK_PARTS) });
      }
      case "reverseVatAdjustment": {
        const id = await rpc<string>("erp_vat_adj_reverse", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(STOCK_PARTS) });
      }
      case "saveRecipe": {
        const recipe = object(a.recipe, "recipe");
        const id = await rpc<string>("erp_save_recipe", { p: recipe, p_actor: actor });
        await timing.time("db", applyTypedLineNets("erp_recipe_lines", "recipe_id", id, recipe));
        const data = await fresh(["recipes", "products"]);
        const recipesCardId = await publishPrepStateToStaff(id, {
          recipes: data.recipes ?? [],
          products: data.products ?? [],
        });
        return timing.json({
          id,
          recipesCardId,
          patch: { recipes: data.recipes, products: data.products },
        });
      }
      case "activateRecipe": {
        const id = uuid(a.id);
        await rpc("erp_activate_recipe", { p_id: id, p_actor: actor });
        const data = await fresh(["recipes", "products"]);
        const recipesCardId = await publishPrepStateToStaff(id, {
          recipes: data.recipes ?? [],
          products: data.products ?? [],
        });
        return timing.json({
          ok: true,
          recipesCardId,
          patch: { recipes: data.recipes, products: data.products },
        });
      }
      case "publishPrepToStaff": {
        const data = await fresh(["recipes", "products"]);
        const recipesCardId = await publishProductPrepToStaff(uuid(a.productId), {
          recipes: data.recipes ?? [],
          products: data.products ?? [],
        });
        return timing.json({ recipesCardId, patch: {} });
      }
      case "resolveRecipeLine": {
        const applied = await rpc("erp_resolve_recipe_line", {
          p_line: uuid(a.lineId),
          p_product: uuid(a.productId),
          p_qty: Number(a.qty),
          p_remember: a.remember === true,
          p_actor: actor,
        });
        return timing.json({ applied, patch: await fresh(["recipes"]) });
      }
      case "saveDish": {
        const dish = object(a.dish, "dish");
        const id = await rpc<string>("erp_save_dish", { p: dish, p_actor: actor });
        await timing.time("db", applyTypedLineNets("erp_dish_lines", "dish_id", id, dish));
        await applyExtraNames(rpc, "dish", id, dish);
        return timing.json({ id, patch: await fresh(["dishes"]) });
      }
      case "recordDishCostSnapshot": {
        const id = await rpc<number>("erp_record_dish_cost_snapshot", {
          p: object(a.snapshot, "snapshot"),
          p_actor: actor,
        });
        return timing.json({ id, patch: {} });
      }
      case "loadDishCostHistory": {
        const history = await rpc("erp_dish_cost_history", {
          p_dish: uuid(a.dishId),
          p_limit: a.limit == null ? 20 : Number(a.limit),
        });
        return timing.json({ history, patch: {} });
      }
      case "staffCatalogMerge": {
        const result = await mergeOldStaffCatalog(a.apply === true, actor);
        return timing.json(a.apply === true ? result : { ...result, patch: {} });
      }
      case "importRecipes":
        throw new ErpHttpError(400, "ERP_RECIPES_IMPORT_DISABLED");
      case "previewCount":
        return timing.json({ preview: await rpc("erp_count_preview", { p: object(a.preview, "preview") }) });
      case "refreshCount": {
        const id = uuid(a.id);
        return timing.json({ id, count: await rpc("erp_count_refresh", { p_id: id, p_actor: actor }) });
      }
      case "reopenCount": {
        const id = uuid(a.id);
        return timing.json({
          id,
          count: await rpc("erp_reopen_count", {
            p_id: id,
            p_actor: actor,
            p_cascade: a.cascade === true,
            p_reason: String(a.reason ?? ""),
          }),
          document: await freshDocument(id),
          patch: await fresh(STOCK_PARTS),
        });
      }
      case "saveFinanceAccount": {
        const id = await rpc("erp_save_finance_account", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "deleteFinanceAccount":
        await rpc("erp_delete_finance_account", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(FINANCE_PARTS) });
      case "restoreFinanceAccount":
        await rpc("erp_restore_finance_account", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(FINANCE_PARTS) });
      case "saveFinanceCategory": {
        const id = await rpc("erp_save_finance_category", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "deleteFinanceCategory":
        await rpc("erp_delete_finance_category", {
          p_id: uuid(a.id),
          p_move_to: a.moveToId ? uuid(a.moveToId) : null,
          p_actor: actor,
        });
        return timing.json({ ok: true, patch: await fresh(FINANCE_PARTS) });
      case "saveFinanceTransaction": {
        const id = await rpc("erp_save_finance_transaction", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "deleteFinanceTransaction":
        await rpc("erp_delete_finance_transaction", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(FINANCE_PARTS) });
      case "restoreFinanceTransaction":
        await rpc("erp_restore_finance_transaction", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(FINANCE_PARTS) });
      case "saveFinanceShift": {
        const id = await rpc("erp_save_finance_shift", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "closeFinanceShift": {
        const id = await rpc("erp_close_finance_shift", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "saveFinanceEmployee": {
        const id = await rpc("erp_save_finance_employee", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "saveFinancePayroll": {
        const id = await rpc("erp_save_finance_payroll", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "payFinancePayroll": {
        const id = await rpc("erp_pay_finance_payroll", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(FINANCE_PARTS) });
      }
      case "saveSalesDocument": {
        const value = object(a.value, "value");
        assertPosterErpSyncAllowed(value);
        const id = await rpc("erp_save_sales_document", { p: value, p_actor: actor });
        return timing.json({ id, patch: await fresh(SALES_PARTS) });
      }
      case "postSalesDocument": {
        const id = await rpc("erp_post_sales_document", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(SALES_PARTS) });
      }
      case "cancelSalesDocument": {
        const id = await rpc("erp_cancel_sales_document", {
          p_id: uuid(a.id),
          p_actor: actor,
          p_reason: a.reason ?? null,
        });
        return timing.json({ id, patch: await fresh(SALES_PARTS) });
      }
      case "refundSalesDocument": {
        const id = await rpc("erp_refund_sales_document", {
          p_id: uuid(a.id),
          p_actor: actor,
          p_amount: a.amount ?? null,
          p_full: Boolean(a.full),
        });
        return timing.json({ id, patch: await fresh(SALES_PARTS) });
      }
      case "linkSalesSource": {
        const value = object(a.value, "value");
        assertPosterErpSyncAllowed({
          source_system: value.source_system,
          source: value.source_system,
          poster_payload: value.raw_payload,
        });
        const id = await rpc("erp_sales_link_source", {
          p_sales_id: uuid(value.sales_document_id),
          p_source: String(value.source_system ?? ""),
          p_external_id: String(value.external_id ?? ""),
          p_account_key: String(value.account_or_location_key ?? ""),
          p_match_kind: String(value.match_kind ?? "manual"),
          p_payload: value.raw_payload ?? null,
          p_actor: actor,
        });
        return timing.json({ id, patch: await fresh(SALES_PARTS) });
      }
      case "postSalesCogs": {
        const result = await rpc("erp_sales_post_cogs", {
          p_id: uuid(a.id),
          p_actor: actor,
          p_auto_consume: Boolean(a.autoConsume),
        });
        return timing.json({ result, patch: await fresh([...SALES_PARTS, ...STOCK_PARTS]) });
      }
      case "validateSalesImportStub": {
        const value = object(a.value, "value");
        assertPosterErpSyncAllowed({
          source_system: value.source_system ?? "import",
          source: value.source_system ?? "import",
        });
        const id = await rpc("erp_sales_import_stub_validate", {
          p_source: String(value.source_system ?? "import"),
          p_rows: value.rows ?? [],
          p_actor: actor,
          p_file_name: value.file_name ?? null,
        });
        return timing.json({ id, patch: {} });
      }
      case "inputVatRegister": {
        const value = object(a.value, "value");
        const register = await rpc("erp_input_vat_register", {
          p_from: value.from ?? null,
          p_to: value.to ?? null,
          p_legal_entity: value.legal_entity_id ?? null,
          p_location: value.location_id ?? null,
          p_supplier: value.supplier_id ?? null,
          p_category: value.category ?? null,
          p_rate: value.rate ?? null,
          p_status: value.status ?? null,
          p_source_type: value.source_type ?? null,
        });
        return timing.json(register);
      }
      case "saveTaxInvoice": {
        const id = await rpc("erp_save_tax_invoice", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["taxInvoices", "inputVatCategories", "expenseDocuments"] as StatePart[]),
        });
      }
      case "saveExpenseDocument": {
        const id = await rpc("erp_save_expense_document", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["expenseDocuments", "inputVatCategories"] as StatePart[]),
        });
      }
      case "postExpenseDocument": {
        const id = await rpc("erp_post_expense_document", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["expenseDocuments"] as StatePart[]),
        });
      }
      case "setExpenseVatStatus": {
        const value = object(a.value, "value");
        const id = await rpc("erp_set_expense_vat_status", {
          p_id: uuid(a.id),
          p_status: String(value.status ?? ""),
          p_pct: value.deductible_vat_pct ?? null,
          p_reason: value.reason ?? null,
          p_actor: actor,
          p_recognition_date: value.tax_recognition_date ?? null,
        });
        return timing.json({
          id,
          patch: await fresh(["expenseDocuments"] as StatePart[]),
        });
      }
      case "platformDashboard": {
        const value = isObject(a.value) ? a.value : {};
        const dash = await rpc("erp_platform_dashboard", {
          p_from: value.from ?? null,
          p_to: value.to ?? null,
          p_account: value.platform_account_id ?? null,
          p_location: value.location_id ?? null,
        });
        return timing.json(dash);
      }
      case "savePlatformAccount": {
        const id = await rpc("erp_save_platform_account", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["platformAccounts"] as StatePart[]) });
      }
      case "platformImportUpload": {
        const id = await rpc("erp_platform_import_upload", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["platformImportBatches"] as StatePart[]) });
      }
      case "platformImportPreview": {
        const value = object(a.value, "value");
        const result = await rpc("erp_platform_import_preview", {
          p_batch_id: uuid(a.id),
          p_rows: value.rows ?? [],
          p_actor: actor,
        });
        return timing.json({ ...((result as object) ?? {}), patch: await fresh(["platformImportBatches"] as StatePart[]) });
      }
      case "platformImportConfirm": {
        const id = await rpc("erp_platform_import_confirm", { p_batch_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(["platformImportBatches"] as StatePart[]) });
      }
      case "platformImportApply": {
        const value = isObject(a.value) ? a.value : {};
        const result = await rpc("erp_platform_import_apply", {
          p_batch_id: uuid(a.id),
          p_actor: actor,
          p_settlement_key: value.settlement_key ?? null,
          p_create_vat_expenses: Boolean(value.create_vat_expenses),
        });
        return timing.json({
          result,
          patch: await fresh([
            "platformImportBatches",
            "platformSettlements",
            "platformSettlementLines",
            "platformReconciliation",
            "expenseDocuments",
          ] as StatePart[]),
        });
      }
      case "savePlatformPayout": {
        const id = await rpc("erp_platform_save_payout", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["platformPayouts", "platformReconciliation"] as StatePart[]),
        });
      }
      case "postPlatformPayout": {
        const id = await rpc("erp_platform_post_payout", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(["platformPayouts"] as StatePart[]) });
      }
      case "platformManualMatch": {
        const value = object(a.value, "value");
        const id = await rpc("erp_platform_manual_match", {
          p_line_id: uuid(a.id),
          p_sales_id: uuid(value.sales_document_id),
          p_actor: actor,
        });
        return timing.json({
          id,
          patch: await fresh(["platformSettlementLines", "platformReconciliation"] as StatePart[]),
        });
      }
      case "saveVatSettlement": {
        const id = await rpc("erp_vat_settlement_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["vatSettlements", "vatCarryforwards"] as StatePart[]),
        });
      }
      case "approveVatSettlement": {
        const id = await rpc("erp_vat_settlement_approve", {
          p_id: uuid(a.id),
          p_actor: actor,
          p_force: Boolean(a.force),
        });
        return timing.json({
          id,
          patch: await fresh(["vatSettlements", "vatCarryforwards"] as StatePart[]),
        });
      }
      case "saveVatCarryforwardOpening": {
        const id = await rpc("erp_vat_carryforward_opening", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["vatCarryforwards"] as StatePart[]) });
      }
      case "saveVatPayment": {
        const id = await rpc("erp_vat_payment_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["vatPayments", "vatSettlements"] as StatePart[]) });
      }
      case "postVatPayment": {
        const id = await rpc("erp_vat_payment_post", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(["vatPayments", "vatSettlements"] as StatePart[]) });
      }
      case "saveVatPeriodCorrection": {
        const id = await rpc("erp_vat_period_correction_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["vatPeriodCorrections"] as StatePart[]) });
      }
      case "exportVatSettlement": {
        const data = await rpc("erp_vat_settlement_export", { p_id: uuid(a.id) });
        return timing.json(data);
      }
      case "profitabilityChannels": {
        const value = object(a.value ?? {}, "value");
        const data = await rpc("erp_profitability_channels", {
          p_from: value.from,
          p_to: value.to,
          p_location: value.location_id ? uuid(value.location_id) : null,
        });
        return timing.json(data);
      }
      case "profitabilityLocations": {
        const value = object(a.value ?? {}, "value");
        const data = await rpc("erp_profitability_locations", {
          p_from: value.from,
          p_to: value.to,
        });
        return timing.json(data);
      }
      case "profitabilityProducts": {
        const value = object(a.value ?? {}, "value");
        const data = await rpc("erp_profitability_products", {
          p_from: value.from,
          p_to: value.to,
          p_channel: value.channel_id ? uuid(value.channel_id) : null,
          p_location: value.location_id ? uuid(value.location_id) : null,
        });
        return timing.json(data);
      }
      case "profitabilityPendingCogs": {
        const value = object(a.value ?? {}, "value");
        const data = await rpc("erp_profitability_pending_cogs", {
          p_from: value.from ?? null,
          p_to: value.to ?? null,
        });
        return timing.json(data);
      }
      case "saveExpensePayment": {
        const id = await rpc("erp_expense_payment_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["expensePayments", "expenseDocuments", "apArItems"] as StatePart[]) });
      }
      case "postExpensePayment": {
        const id = await rpc("erp_expense_payment_post", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(["expensePayments", "expenseDocuments", "apArItems"] as StatePart[]) });
      }
      case "saveExpenseAllocation": {
        const id = await rpc("erp_expense_allocation_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["expenseDocuments"] as StatePart[]) });
      }
      case "savePayrollAccrual": {
        const id = await rpc("erp_payroll_accrual_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["payrollAccruals"] as StatePart[]) });
      }
      case "postPayrollAccrual": {
        const id = await rpc("erp_payroll_accrual_post", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(["payrollAccruals", "apArItems"] as StatePart[]) });
      }
      case "postPayrollPayment": {
        const id = await rpc("erp_payroll_payment_post", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["payrollAccruals", "apArItems"] as StatePart[]) });
      }
      case "saveFixedAsset": {
        const id = await rpc("erp_fixed_asset_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["fixedAssets"] as StatePart[]) });
      }
      case "activateFixedAsset": {
        const id = await rpc("erp_fixed_asset_activate", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ id, patch: await fresh(["fixedAssets"] as StatePart[]) });
      }
      case "runDepreciation": {
        const value = object(a.value, "value");
        const id = await rpc("erp_depreciation_run", {
          p_asset_id: uuid(value.asset_id),
          p_period_start: value.period_start,
          p_period_end: value.period_end,
          p_actor: actor,
        });
        return timing.json({ id, patch: await fresh(["fixedAssets"] as StatePart[]) });
      }
      case "accrualPnl": {
        const value = object(a.value ?? {}, "value");
        return timing.json(await rpc("erp_accrual_pnl", { p_from: value.from, p_to: value.to, p_location: value.location_id ? uuid(value.location_id) : null }));
      }
      case "managementCashflow": {
        const value = object(a.value ?? {}, "value");
        return timing.json(await rpc("erp_management_cashflow", { p_from: value.from, p_to: value.to }));
      }
      case "financeDashboard": {
        const value = object(a.value ?? {}, "value");
        return timing.json(await rpc("erp_finance_dashboard", { p_from: value.from, p_to: value.to }));
      }
      case "apArSummary": {
        return timing.json(await rpc("erp_ap_ar_summary", {}));
      }
      case "saveFinancialPeriod": {
        const id = await rpc("erp_financial_period_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["financialPeriods"] as StatePart[]),
        });
      }
      case "setFinancialPeriodStatus": {
        const value = object(a.value ?? {}, "value");
        const id = await rpc("erp_financial_period_set_status", {
          p_id: uuid(a.id),
          p_status: value.status,
          p_actor: actor,
          p_reason: value.reason ?? null,
        });
        return timing.json({
          id,
          patch: await fresh(["financialPeriods", "auditLog"] as StatePart[]),
        });
      }
      case "periodCloseChecklist": {
        return timing.json(await rpc("erp_period_close_checklist", { p_id: uuid(a.id) }));
      }
      case "closeFinancialPeriod": {
        const value = object(a.value ?? {}, "value");
        const res = await rpc("erp_period_close", {
          p_id: uuid(a.id),
          p_actor: actor,
          p_ack_warnings: Boolean(value.ack_warnings),
          p_ack_reason: value.ack_reason ?? null,
        });
        return timing.json({
          ...(res as object),
          patch: await fresh([
            "financialPeriods",
            "periodClosings",
            "periodCloseChecks",
            "periodSnapshots",
            "auditLog",
          ] as StatePart[]),
        });
      }
      case "reopenFinancialPeriod": {
        const value = object(a.value ?? {}, "value");
        const id = await rpc("erp_period_reopen", {
          p_id: uuid(a.id),
          p_actor: actor,
          p_reason: value.reason,
        });
        return timing.json({
          id,
          patch: await fresh(["financialPeriods", "periodReopenRequests", "auditLog"] as StatePart[]),
        });
      }
      case "listPeriodSnapshots": {
        return timing.json(await rpc("erp_period_snapshots_list", { p_period_id: uuid(a.id) }));
      }
      case "saveFinancialCorrection": {
        const id = await rpc("erp_financial_correction_save", { p: object(a.value, "value"), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["financialCorrections", "auditLog"] as StatePart[]),
        });
      }
      case "postFinancialCorrection": {
        const id = await rpc("erp_financial_correction_post", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({
          id,
          patch: await fresh(["financialCorrections", "auditLog"] as StatePart[]),
        });
      }
      default:
        throw new ErpHttpError(400, "ERP_INVALID", "action");
    }
  } catch (error) {
    return timing.error(error);
  }
}
