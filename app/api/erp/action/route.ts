import { NextResponse } from "next/server";
import { mergeRecipes } from "@/data/recipes";
import { erpLocalMode } from "@/lib/erp/localDb";
import { ErpHttpError, errorResponse, requireAdmin, rpc } from "@/lib/erp/server";
import type { ErpAction } from "@/lib/erp/types";
import { readStoredRecipes } from "@/lib/recipes-admin/storage";
import { mergeOldStaffCatalog, refreshStaffMirror } from "@/lib/erp/staffCatalogSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REF_ENTITIES = new Set(["category", "supplier", "warehouse", "channel"]);
const CATALOG_ENTITIES = new Set(["product", "category", "supplier"]);
const ARCHIVE_ENTITIES = new Set(["product", "category", "supplier", "warehouse", "channel", "dish"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** All ERP writes. Every action requires an admin session; the email is stored as the author. */
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = (await request.json().catch(() => null)) as ErpAction | null;
    if (!isObject(body)) throw new ErpHttpError(400, "ERP_INVALID", "body");
    const a = body as ErpAction;

    switch (a.action) {
      case "saveProduct": {
        const id = await rpc("erp_save_product", { p: object(a.product, "product"), p_actor: actor });
        await refreshStaffMirror();
        return NextResponse.json({ id });
      }
      case "setArchived":
        if (!ARCHIVE_ENTITIES.has(a.entity)) throw new ErpHttpError(400, "ERP_INVALID", "entity");
        await rpc("erp_set_archived", { p_entity: a.entity, p_id: uuid(a.id), p_archived: a.archived === true, p_actor: actor });
        if (CATALOG_ENTITIES.has(a.entity)) await refreshStaffMirror();
        return NextResponse.json({ ok: true });
      case "saveRef":
        if (!REF_ENTITIES.has(a.entity)) throw new ErpHttpError(400, "ERP_INVALID", "entity");
        {
          const id = await rpc("erp_save_ref", { p_entity: a.entity, p: object(a.value, "value"), p_actor: actor });
          if (CATALOG_ENTITIES.has(a.entity)) await refreshStaffMirror();
          return NextResponse.json({ id });
        }
      case "saveSettings":
        await rpc("erp_save_settings", { p: object(a.settings, "settings"), p_actor: actor });
        return NextResponse.json({ ok: true });
      case "saveDocument":
        return NextResponse.json({ id: await rpc("erp_save_document", { p_doc: object(a.document, "document"), p_actor: actor }) });
      case "postDocument":
        return NextResponse.json({ result: await rpc("erp_post_document", { p_id: uuid(a.id), p_actor: actor }) });
      case "cancelDocument":
        return NextResponse.json({
          result: await rpc("erp_cancel_document", { p_id: uuid(a.id), p_actor: actor, p_reason: String(a.reason ?? "") }),
        });
      case "deleteDraft":
        await rpc("erp_delete_draft", { p_id: uuid(a.id), p_actor: actor });
        return NextResponse.json({ ok: true });
      case "saveRecipe":
        return NextResponse.json({ id: await rpc("erp_save_recipe", { p: object(a.recipe, "recipe"), p_actor: actor }) });
      case "activateRecipe":
        await rpc("erp_activate_recipe", { p_id: uuid(a.id), p_actor: actor });
        return NextResponse.json({ ok: true });
      case "resolveRecipeLine":
        return NextResponse.json({
          applied: await rpc("erp_resolve_recipe_line", {
            p_line: uuid(a.lineId),
            p_product: uuid(a.productId),
            p_qty: Number(a.qty),
            p_remember: a.remember === true,
            p_actor: actor,
          }),
        });
      case "saveDish":
        return NextResponse.json({ id: await rpc("erp_save_dish", { p: object(a.dish, "dish"), p_actor: actor }) });
      case "staffCatalogMerge":
        return NextResponse.json(await mergeOldStaffCatalog(a.apply === true, actor));
      case "importRecipes": {
        const recipes = mergeRecipes(erpLocalMode() ? null : await readStoredRecipes());
        return NextResponse.json({ result: await rpc("erp_import_recipes", { p_recipes: recipes, p_actor: actor }) });
      }
      default:
        throw new ErpHttpError(400, "ERP_INVALID", "action");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
