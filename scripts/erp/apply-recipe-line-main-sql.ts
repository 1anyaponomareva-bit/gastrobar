/**
 * Apply composition is_main columns over Postgres. Prints no secrets.
 * Additive columns and save-recipe/dish update. Never drops recipe or dish rows.
 * Leaves prep-card header / cooking-step columns in place.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function loadEnvFile(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* missing file is fine */
  }
}

function loadEnv() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  for (const extra of (process.env.ERP_ENV_FILES ?? "").split(";")) {
    if (extra.trim()) loadEnvFile(extra.trim());
  }
}

async function main() {
  loadEnv();
  const password =
    process.env.DB_PASSWORD?.trim() || process.env.POSTGRES_PASSWORD?.trim() || process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "")
    .replace(/^https?:\/\//, "")
    .split(".")[0];
  if (!password || !ref) throw new Error("Postgres password or project ref missing");

  let Client: new (cfg: object) => {
    connect: () => Promise<void>;
    query: (sql: string) => Promise<{ rows: unknown[] }>;
    end: () => Promise<void>;
  };
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    Client = req("pg").Client;
  } catch {
    throw new Error("pg package is not installed");
  }

  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261114180000_erp_recipe_line_main.sql"), "utf8");
  const hosts = [
    { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", database: "postgres" },
    { host: `db.${ref}.supabase.co`, port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-southeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-southeast-1.pooler.supabase.com", port: 6543, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 6543, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-northeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-northeast-1.pooler.supabase.com", port: 6543, user: `postgres.${ref}`, database: "postgres" },
  ];

  let last = "no host tried";
  for (const h of hosts) {
    const client = new Client({
      ...h,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      statement_timeout: 120000,
    });
    try {
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("connect timeout")), 10000)),
      ]);
      console.log(JSON.stringify({ connected: true, host: h.host, port: h.port, ref }));
      const before = await client.query(`
        select
          (select count(*)::int from public.erp_recipes) as recipes,
          (select count(*)::int from public.erp_products) as products,
          (select count(*)::int from public.erp_dishes) as dishes,
          (select count(*)::int from public.erp_recipe_lines) as recipe_lines
      `);
      console.log(JSON.stringify({ before: before.rows[0] }));
      await client.query(sql);
      const after = await client.query(`
        select
          (select count(*)::int from public.erp_recipes) as recipes,
          (select count(*)::int from public.erp_products) as products,
          (select count(*)::int from public.erp_dishes) as dishes,
          (select count(*)::int from public.erp_recipe_lines) as recipe_lines,
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'erp_recipe_lines' and column_name = 'is_main'
          ) as recipe_has_main,
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'erp_dish_lines' and column_name = 'is_main'
          ) as dish_has_main,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%card_revision%' as save_writes_header,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%is_main%' as save_writes_main
      `);
      console.log(JSON.stringify({ after: after.rows[0], applied: "20261114180000_erp_recipe_line_main.sql" }));
      const b = before.rows[0] as { recipes: number; products: number; dishes: number; recipe_lines: number };
      const a = after.rows[0] as {
        recipes: number;
        products: number;
        dishes: number;
        recipe_lines: number;
        recipe_has_main: boolean;
        dish_has_main: boolean;
        save_writes_header: boolean;
        save_writes_main: boolean;
      };
      if (a.recipes !== b.recipes) throw new Error("recipe count changed");
      if (a.products !== b.products) throw new Error("product count changed");
      if (a.dishes !== b.dishes) throw new Error("dish count changed");
      if (a.recipe_lines !== b.recipe_lines) throw new Error("recipe line count changed");
      if (!a.recipe_has_main || !a.dish_has_main) throw new Error("is_main columns missing");
      if (!a.save_writes_header) throw new Error("erp_save_recipe dropped card_revision");
      if (!a.save_writes_main) throw new Error("erp_save_recipe does not persist is_main");
      await client.end();
      return;
    } catch (error) {
      const err = error as { message?: string; code?: string };
      last = `${h.host}:${h.port} ${err.code ?? ""} ${err.message ?? "error"}`.trim();
      console.log(
        JSON.stringify({
          connected: false,
          host: h.host,
          port: h.port,
          user: h.user,
          code: err.code ?? "",
          message: String(err.message ?? "error").slice(0, 180),
        }),
      );
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error(`Postgres apply failed: ${last}`);
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : "error");
  process.exit(1);
});
