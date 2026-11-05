import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_STAFF_CATALOG, sanitizeStaffCatalog, type StaffCatalog } from "@/data/staffCatalog";
import { readStaffCatalog, readStaffCatalogBackup, writeStaffCatalog, writeStaffCatalogBackup } from "@/lib/recipes-admin/storage";
import { erpLocalMode } from "./localDb";
import { erpDb, check, ErpHttpError, rpc } from "./server";
import { planStaffMerge, type ErpCatalogRows, type StaffMergeResult } from "./staffMerge";

/**
 * Where Staff reads and saves its order catalog.
 *
 * ERP_CATALOG_SOURCE=db — the shared catalog: the ERP tables. Every save is also copied to the
 *   old Staff file, so switching back (removing the variable) shows the latest catalog.
 * otherwise           — the old Staff file in storage (the ERP only sees it after a transfer).
 */
export const erpCatalogEnabled = () => process.env.ERP_CATALOG_SOURCE?.trim() === "db";

export type CatalogSource = "erp" | "file";
/** Ids Staff must not give to new records because ERP rows it does not see already use them. */
export type ReservedIds = { items: string[]; suppliers: string[]; categories: string[] };
export type LoadedCatalog = { catalog: StaffCatalog; version: string; source: CatalogSource; reserved: ReservedIds };

const NONE: ReservedIds = { items: [], suppliers: [], categories: [] };

const LOCAL_FILE = () => path.join(process.cwd(), "node_modules", ".erp-local-staff", "staff-catalog.json");

/** The old Staff file. In local development it is a file on disk instead of cloud storage. */
async function readFileCatalog(): Promise<StaffCatalog | null> {
  if (erpLocalMode()) {
    try {
      return JSON.parse(await readFile(LOCAL_FILE(), "utf8")) as StaffCatalog;
    } catch {
      return null;
    }
  }
  return readStaffCatalog();
}

async function writeFileCatalog(catalog: StaffCatalog): Promise<void> {
  if (erpLocalMode()) {
    await mkdir(path.dirname(LOCAL_FILE()), { recursive: true });
    await writeFile(LOCAL_FILE(), JSON.stringify(catalog, null, 2), "utf8");
    return;
  }
  await writeStaffCatalog(catalog);
}

const fileVersion = (catalog: StaffCatalog) => createHash("sha1").update(JSON.stringify(catalog)).digest("hex");

async function loadErpCatalog(): Promise<LoadedCatalog> {
  const [raw, version, reserved] = await Promise.all([
    rpc("erp_staff_catalog", {}),
    rpc<string>("erp_staff_catalog_version", {}),
    rpc<ReservedIds>("erp_staff_reserved_ids", {}),
  ]);
  const catalog = sanitizeStaffCatalog(raw);
  if (!catalog) throw new Error("ERP staff catalog export is invalid");
  return { catalog, version, source: "erp", reserved };
}

async function loadOldCatalog(): Promise<StaffCatalog> {
  return sanitizeStaffCatalog((await readFileCatalog()) ?? DEFAULT_STAFF_CATALOG) ?? DEFAULT_STAFF_CATALOG;
}

export async function loadStaffCatalog(): Promise<LoadedCatalog> {
  if (erpCatalogEnabled()) return loadErpCatalog();
  const catalog = await loadOldCatalog();
  return { catalog, version: fileVersion(catalog), source: "file", reserved: NONE };
}

/**
 * Saves a whole catalog edited in Staff. `baseVersion` is the version the editor loaded:
 * a catalog built from an outdated copy is refused (409) instead of overwriting newer data.
 */
export async function saveStaffCatalog(catalog: StaffCatalog, baseVersion: string, actor: string): Promise<LoadedCatalog> {
  if (erpCatalogEnabled()) {
    await rpc("erp_save_staff_catalog", { p_catalog: catalog, p_base_version: baseVersion, p_actor: actor }).catch((error) => {
      if (error instanceof ErpHttpError && error.code === "ERP_STALE") throw new ErpHttpError(409, "ERP_STALE");
      throw error;
    });
    const saved = await loadErpCatalog();
    await mirrorToFile(saved.catalog);
    return saved;
  }
  const current = await loadOldCatalog();
  if (fileVersion(current) !== baseVersion) throw new ErpHttpError(409, "ERP_STALE");
  await writeFileCatalog(catalog);
  return { catalog, version: fileVersion(catalog), source: "file", reserved: NONE };
}

/** The backup is never removed, so once seen it need not be looked up again by this instance. */
let backupExists = false;

async function backupOldFileOnce(): Promise<void> {
  if (backupExists) return;
  if (erpLocalMode()) {
    const backup = LOCAL_FILE().replace(/\.json$/, ".before-erp.json");
    const exists = await readFile(backup, "utf8").then(() => true, () => false);
    if (exists) backupExists = true;
    else {
      const old = await readFile(LOCAL_FILE(), "utf8").catch(() => null);
      if (old !== null) await writeFile(backup, old, "utf8");
      backupExists = old !== null;
    }
    return;
  }
  if (await readStaffCatalogBackup()) backupExists = true;
  else {
    const old = await readStaffCatalog();
    if (old) await writeStaffCatalogBackup(old);
    backupExists = Boolean(old);
  }
}

/** Keeps the old Staff file equal to the shared catalog, so turning the switch off loses nothing. */
async function mirrorToFile(catalog: StaffCatalog) {
  try {
    await backupOldFileOnce();
    await writeFileCatalog(catalog);
  } catch (error) {
    console.error("[staff-catalog] rollback copy was not written", error);
  }
}

/** After an ERP edit: refresh the rollback copy when the shared catalog is on. */
export async function refreshStaffMirror(): Promise<void> {
  if (!erpCatalogEnabled()) return;
  try {
    await mirrorToFile((await loadErpCatalog()).catalog);
  } catch (error) {
    console.error("[staff-catalog] rollback copy was not refreshed", error);
  }
}

async function rows<T>(table: string, filter?: [string, string][]): Promise<T[]> {
  let query = erpDb().from(table).select("*");
  for (const [column, value] of filter ?? []) query = query.eq(column, value);
  return check<T[]>(await query.limit(10000));
}

async function erpCatalogRows(): Promise<ErpCatalogRows> {
  const [categories, suppliers, products, itemLinks] = await Promise.all([
    rows<ErpCatalogRows["categories"][number]>("erp_categories"),
    rows<ErpCatalogRows["suppliers"][number]>("erp_suppliers"),
    rows<ErpCatalogRows["products"][number]>("erp_products"),
    rows<ErpCatalogRows["itemLinks"][number]>("erp_legacy_map", [
      ["source", "staff"],
      ["entity", "item"],
    ]),
  ]);
  return { categories, suppliers, products, itemLinks };
}

/**
 * Compares the old Staff file with the ERP; with `apply` adds only the records the ERP is missing
 * (ambiguous ones are left out). Repeatable: a second run has nothing to add.
 */
export async function mergeOldStaffCatalog(apply: boolean, actor: string): Promise<StaffMergeResult> {
  const stored = await readFileCatalog();
  const staff = sanitizeStaffCatalog(stored ?? DEFAULT_STAFF_CATALOG);
  if (!staff) throw new ErpHttpError(400, "ERP_INVALID", "staff catalog file");
  let plan = planStaffMerge(staff, await erpCatalogRows());
  let applied: Record<string, number> | undefined;
  if (apply) {
    applied = await rpc<Record<string, number>>("erp_add_staff_catalog", { p_catalog: plan.add, p_actor: actor });
    plan = planStaffMerge(staff, await erpCatalogRows());
    await refreshStaffMirror();
  }
  return { source: erpCatalogEnabled() ? "erp" : "file", fileFound: Boolean(stored), plan, applied };
}
