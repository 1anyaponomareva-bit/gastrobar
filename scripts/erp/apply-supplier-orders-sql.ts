/**
 * Apply additive supplier-order migrations over Postgres. Prints no secrets.
 * Never drops catalog tables. Checks product/supplier counts before and after.
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

const FILES = [
  "20261107120000_erp_supplier_orders.sql",
  "20261107121500_erp_order_pdf_snapshot.sql",
  "20261107130000_erp_product_pack_code.sql",
  "20261107140000_erp_order_list_catalog.sql",
  "20261107150000_erp_pack_code_backfill.sql",
  "20261107160000_erp_order_pdf_line_code.sql",
  "20261107170000_erp_order_pdf_pack_qty.sql",
  "20261107180000_erp_warehouse_contact.sql",
  "20261107190000_erp_order_receive_flag.sql",
];

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

  const hosts = [
    { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", database: "postgres" },
    { host: `db.${ref}.supabase.co`, port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-southeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-southeast-1.pooler.supabase.com", port: 6543, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 6543, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-northeast-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-northeast-1.pooler.supabase.com", port: 6543, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-southeast-2.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
    { host: "aws-0-ap-south-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}`, database: "postgres" },
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
          (select count(*)::int from public.erp_suppliers) as suppliers,
          (select count(*)::int from public.erp_packs) as packs,
          (select count(*)::int from public.erp_product_packs) as product_packs,
          to_regclass('public.erp_supplier_orders') is not null as orders_table
      `);
      console.log(JSON.stringify({ before: before.rows[0] }));
      for (const file of FILES) {
        const sql = readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8");
        await client.query(sql);
        console.log(JSON.stringify({ applied: file }));
      }
      const after = await client.query(`
        select
          (select count(*)::int from public.erp_products) as products,
          (select count(*)::int from public.erp_suppliers) as suppliers,
          (select count(*)::int from public.erp_packs) as packs,
          (select count(*)::int from public.erp_product_packs) as product_packs,
          to_regclass('public.erp_supplier_orders') is not null as orders_table,
          to_regclass('public.erp_order_receipts') is not null as receipts_table,
          (select count(*)::int from public.erp_supplier_orders) as order_rows
      `);
      console.log(JSON.stringify({ after: after.rows[0] }));
      const b = before.rows[0] as Record<string, number | boolean>;
      const a = after.rows[0] as Record<string, number | boolean>;
      if (a.products !== b.products || a.suppliers !== b.suppliers || a.packs !== b.packs || a.product_packs !== b.product_packs) {
        throw new Error("catalog counts changed");
      }
      await client.end();
      return;
    } catch (error) {
      const err = error as { message?: string; code?: string };
      last = `${h.host}:${h.port} ${err.code ?? ""} ${err.message ?? "error"}`.trim();
      console.log(JSON.stringify({ connected: false, host: h.host, port: h.port, user: h.user, code: err.code ?? "", message: String(err.message ?? "error").slice(0, 180) }));
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
