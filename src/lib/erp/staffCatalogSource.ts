import { DEFAULT_STAFF_CATALOG, sanitizeStaffCatalog, type StaffCatalog } from "@/data/staffCatalog";
import { readStaffCatalog, writeStaffCatalog } from "@/lib/recipes-admin/storage";
import { rpc } from "./server";

/**
 * Staff reads and writes the order catalog here. Until ERP_CATALOG_SOURCE=db is set
 * (after the ERP migration and import are applied), the JSON file stays the source.
 */
export const erpCatalogEnabled = () => process.env.ERP_CATALOG_SOURCE?.trim() === "db";

export async function loadStaffCatalog(): Promise<StaffCatalog> {
  if (erpCatalogEnabled()) {
    const catalog = sanitizeStaffCatalog(await rpc("erp_staff_catalog", {}));
    if (!catalog) throw new Error("ERP staff catalog export is invalid");
    return catalog;
  }
  return (await readStaffCatalog()) ?? DEFAULT_STAFF_CATALOG;
}

export async function saveStaffCatalog(catalog: StaffCatalog, actor: string): Promise<StaffCatalog> {
  if (erpCatalogEnabled()) {
    await rpc("erp_sync_staff_catalog", { p_catalog: catalog, p_actor: actor });
    return loadStaffCatalog();
  }
  await writeStaffCatalog(catalog);
  return catalog;
}
