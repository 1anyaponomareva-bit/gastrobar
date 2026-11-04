import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const MIGRATION = path.join(process.cwd(), "supabase/migrations/20261103120000_erp_v1.sql");

/** In-memory Postgres with the Supabase roles the migration grants to. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync(MIGRATION, "utf8"));
  return db;
}

export async function applyMigration(db: PGlite) {
  await db.exec(readFileSync(MIGRATION, "utf8"));
}
