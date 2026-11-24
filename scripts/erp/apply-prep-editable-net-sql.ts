/**
 * Apply editable net_qty on prep recipe lines. Prints no secrets.
 * Additive function replace only. Never drops recipe rows.
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

  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261124150000_erp_prep_editable_net.sql"), "utf8");
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
          (select count(*)::int from public.erp_recipe_lines) as recipe_lines,
          (select count(*)::int from public.erp_lots) as lots
      `);
      console.log(JSON.stringify({ before: before.rows[0] }));
      await client.query(sql);
      const after = await client.query(`
        select
          (select count(*)::int from public.erp_recipes) as recipes,
          (select count(*)::int from public.erp_products) as products,
          (select count(*)::int from public.erp_recipe_lines) as recipe_lines,
          (select count(*)::int from public.erp_lots) as lots,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%erp_assert_recipe_component%' as save_checks_component,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%erp_recipe_kind%' as save_writes_kind,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%is_main%' as save_writes_main,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%card_no%' as save_writes_header,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) like '%instructions%' as save_keeps_steps,
          pg_get_functiondef('public.erp_save_recipe(jsonb, text)'::regprocedure) not like '%v_prep then null else nullif(v_line%net_qty%' as saves_net_on_preps,
          exists (
            select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
            where c.relname = 'erp_lots' and t.tgname = 'erp_lots_touch_output_est'
          ) as has_output_est_trigger
      `);
      console.log(JSON.stringify({ after: after.rows[0], applied: "20261124150000_erp_prep_editable_net.sql" }));
      const b = before.rows[0] as { recipes: number; products: number; recipe_lines: number; lots: number };
      const a = after.rows[0] as {
        recipes: number;
        products: number;
        recipe_lines: number;
        lots: number;
        save_checks_component: boolean;
        save_writes_kind: boolean;
        save_writes_main: boolean;
        save_writes_header: boolean;
        save_keeps_steps: boolean;
        saves_net_on_preps: boolean;
        has_output_est_trigger: boolean;
      };
      if (a.recipes !== b.recipes) throw new Error("recipe count changed");
      if (a.products !== b.products) throw new Error("product count changed");
      if (a.recipe_lines !== b.recipe_lines) throw new Error("recipe line count changed");
      if (a.lots !== b.lots) throw new Error("lot count changed");
      if (!a.save_checks_component) throw new Error("erp_save_recipe does not check nested components");
      if (!a.save_writes_kind) throw new Error("erp_save_recipe dropped kind");
      if (!a.save_writes_main) throw new Error("erp_save_recipe dropped is_main");
      if (!a.save_writes_header) throw new Error("erp_save_recipe dropped card header");
      if (!a.save_keeps_steps) throw new Error("erp_save_recipe dropped cooking steps");
      if (!a.saves_net_on_preps) throw new Error("erp_save_recipe still strips net on prep SKUs");
      if (!a.has_output_est_trigger) throw new Error("output est_unit_cost trigger missing");
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
