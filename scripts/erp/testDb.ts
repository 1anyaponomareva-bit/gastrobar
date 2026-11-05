import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** In order: later files replace functions of earlier ones. */
export const MIGRATIONS = ["20261103120000_erp_v1.sql", "20261105120000_erp_losses_report.sql", "20261105150000_erp_staff_category.sql", "20261105170000_erp_shared_catalog.sql", "20261105190000_erp_speed.sql", "20261105220000_erp_writeoff_reasons.sql", "20261105230000_erp_inventory_counts.sql", "20261105240000_erp_receipt_supplier.sql"].map((file) =>
  path.join(process.cwd(), "supabase/migrations", file),
);

/** In-memory Postgres with the Supabase roles the migration grants to. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await applyMigration(db);
  return db;
}

export async function applyMigration(db: PGlite) {
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
}
