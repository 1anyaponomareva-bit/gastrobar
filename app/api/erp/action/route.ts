import { after } from "next/server";
import { mergeRecipes } from "@/data/recipes";
import { erpLocalMode } from "@/lib/erp/localDb";
import { check, erpDb, ErpHttpError, requireAdmin, rpc as rawRpc, ServerTiming } from "@/lib/erp/server";
import { loadDocument, loadState, type StatePart } from "@/lib/erp/stateLoader";
import type { ErpAction } from "@/lib/erp/types";
import { readStoredRecipes } from "@/lib/recipes-admin/storage";
import { mergeOldStaffCatalog, refreshStaffMirror } from "@/lib/erp/staffCatalogSource";

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
const STOCK_PARTS: StatePart[] = ["stock", "products"];

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
      case "saveProduct": {
        const id = await rpc("erp_save_product", { p: object(a.product, "product"), p_actor: actor });
        mirrorStaffLater();
        return timing.json({ id, patch: await fresh(["products", "packs", "productPacks"]) });
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
          const id = await rpc("erp_save_ref", { p_entity: a.entity, p: object(a.value, "value"), p_actor: actor });
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
        return timing.json({ ok: true, patch: await fresh(["settings"]) });
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
      case "saveRecipe": {
        const id = await rpc("erp_save_recipe", { p: object(a.recipe, "recipe"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["recipes"]) });
      }
      case "activateRecipe":
        await rpc("erp_activate_recipe", { p_id: uuid(a.id), p_actor: actor });
        return timing.json({ ok: true, patch: await fresh(["recipes"]) });
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
        const id = await rpc("erp_save_dish", { p: object(a.dish, "dish"), p_actor: actor });
        return timing.json({ id, patch: await fresh(["dishes"]) });
      }
      case "staffCatalogMerge": {
        const result = await mergeOldStaffCatalog(a.apply === true, actor);
        return timing.json(a.apply === true ? result : { ...result, patch: {} });
      }
      case "importRecipes": {
        const recipes = mergeRecipes(erpLocalMode() ? null : await readStoredRecipes());
        return timing.json({ result: await rpc("erp_import_recipes", { p_recipes: recipes, p_actor: actor }) });
      }
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
      default:
        throw new ErpHttpError(400, "ERP_INVALID", "action");
    }
  } catch (error) {
    return timing.error(error);
  }
}
