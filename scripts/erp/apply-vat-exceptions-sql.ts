/**
 * Apply ingredient VAT default + exception table over Postgres. Prints no secrets.
 * Additive: fills null defaults with 8%, new table, RPCs. Never drops product rows.
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

  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261114140000_erp_vat_exceptions.sql"), "utf8");
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
          (select count(*)::int from public.erp_products) as products,
          (select default_input_vat_rate from public.erp_settings where id = 1) as input_rate,
          exists (
            select 1 from information_schema.tables
            where table_schema = 'public' and table_name = 'erp_vat_exceptions'
          ) as has_table
      `);
      console.log(JSON.stringify({ before: before.rows[0] }));
      await client.query(sql);
      const after = await client.query(`
        select
          (select count(*)::int from public.erp_products) as products,
          (select default_input_vat_rate from public.erp_settings where id = 1) as input_rate,
          exists (
            select 1 from information_schema.tables
            where table_schema = 'public' and table_name = 'erp_vat_exceptions'
          ) as has_table,
          (select count(*)::int from public.erp_vat_exceptions) as exceptions,
          pg_get_functiondef('public.erp_effective_input_vat_rate(uuid)'::regprocedure) like '%erp_vat_exceptions%' as rate_fn,
          pg_get_functiondef('public.erp_post_document(uuid, text)'::regprocedure) like '%erp_effective_input_vat_rate%' as post_uses_effective
      `);
      console.log(JSON.stringify({ after: after.rows[0], applied: "20261114140000_erp_vat_exceptions.sql" }));
      const b = before.rows[0] as { products: number };
      const a = after.rows[0] as {
        products: number;
        has_table: boolean;
        rate_fn: boolean;
        post_uses_effective: boolean;
      };
      if (a.products !== b.products) throw new Error("product count changed");
      if (!a.has_table) throw new Error("erp_vat_exceptions missing");
      if (!a.rate_fn) throw new Error("effective VAT function missing exceptions");
      if (!a.post_uses_effective) throw new Error("erp_post_document does not use effective VAT");
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
