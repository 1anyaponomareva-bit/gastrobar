import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** In order: later files replace functions of earlier ones. */
export const MIGRATIONS = ["20261103120000_erp_v1.sql", "20261105120000_erp_losses_report.sql", "20261105150000_erp_staff_category.sql", "20261105170000_erp_shared_catalog.sql", "20261105190000_erp_speed.sql", "20261105220000_erp_writeoff_reasons.sql", "20261105230000_erp_inventory_counts.sql", "20261105240000_erp_receipt_supplier.sql", "20261105250000_erp_ordering_units.sql", "20261105260000_erp_count_idle_and_unknown_cost.sql", "20261105270000_erp_pack_exact_duplicates.sql", "20261105280000_erp_production_post_guards.sql", "20261105290000_erp_consume_same_time_fifo.sql", "20261106011500_erp_speed_load_state.sql", "20261106143000_erp_menu_cost_history.sql", "20261106180000_erp_locations_and_category_trash.sql", "20261106200000_erp_product_code.sql", "20261107120000_erp_supplier_orders.sql", "20261107121500_erp_order_pdf_snapshot.sql", "20261107130000_erp_product_pack_code.sql", "20261107140000_erp_order_list_catalog.sql", "20261107150000_erp_pack_code_backfill.sql", "20261107160000_erp_order_pdf_line_code.sql", "20261107170000_erp_order_pdf_pack_qty.sql", "20261107180000_erp_warehouse_contact.sql", "20261107190000_erp_order_receive_flag.sql"].map((file) =>
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
