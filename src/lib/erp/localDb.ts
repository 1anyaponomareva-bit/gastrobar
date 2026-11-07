/**
 * Development-only stand-in for the Supabase client: runs the ERP migration on a
 * local PGlite database and answers the small subset of the query builder the ERP
 * API uses. Enabled only with ERP_LOCAL_DB=pglite under `next dev`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; details?: string; code?: string } | null };
type Db = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  exec: (sql: string) => Promise<unknown>;
};

// Each route is bundled separately in dev; one shared instance per process, because
// two PGlite instances on the same directory corrupt it.
const shared = globalThis as typeof globalThis & { __erpLocalDb?: Promise<Db> };

/** In order: later files replace functions of earlier ones. */
export const ERP_MIGRATIONS = ["20261103120000_erp_v1.sql", "20261105120000_erp_losses_report.sql", "20261105150000_erp_staff_category.sql", "20261105170000_erp_shared_catalog.sql", "20261105190000_erp_speed.sql", "20261105220000_erp_writeoff_reasons.sql", "20261105230000_erp_inventory_counts.sql", "20261105240000_erp_receipt_supplier.sql", "20261105250000_erp_ordering_units.sql", "20261105260000_erp_count_idle_and_unknown_cost.sql", "20261105270000_erp_pack_exact_duplicates.sql", "20261105280000_erp_production_post_guards.sql", "20261105290000_erp_consume_same_time_fifo.sql", "20261106011500_erp_speed_load_state.sql", "20261106143000_erp_menu_cost_history.sql", "20261106180000_erp_locations_and_category_trash.sql", "20261106200000_erp_product_code.sql", "20261107120000_erp_supplier_orders.sql", "20261107121500_erp_order_pdf_snapshot.sql", "20261107130000_erp_product_pack_code.sql", "20261107140000_erp_order_list_catalog.sql", "20261107150000_erp_pack_code_backfill.sql", "20261107160000_erp_order_pdf_line_code.sql"];

export const erpLocalMode = () =>
  process.env.ERP_LOCAL_DB === "pglite" &&
  (process.env.NODE_ENV === "development" ||
    // Speed measurements of a production build on this machine; never on Vercel.
    (process.env.ERP_LOCAL_PROD_TEST === "1" && !process.env.VERCEL));

/**
 * Optional emulated network round trip to a remote database (ERP_LOCAL_LATENCY_MS), for
 * measuring how many sequential trips a screen makes. Parallel calls wait in parallel.
 */
export function localNetworkDelay(): Promise<void> | null {
  const ms = Number(process.env.ERP_LOCAL_LATENCY_MS) || 0;
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : null;
}

async function getDb(): Promise<Db> {
  if (!shared.__erpLocalDb) {
    shared.__erpLocalDb = (async () => {
      const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
      // ERP_LOCAL_DB_DIR: a separate local database, e.g. for a second working copy sharing node_modules.
      const dir = process.env.ERP_LOCAL_DB_DIR?.trim() || path.join(process.cwd(), "node_modules", ".erp-local-db");
      const db = new PGlite(dir, {
        parsers: {
          20: (v: string) => Number(v),
          1700: (v: string) => Number(v),
          1082: (v: string) => v,
          1114: (v: string) => new Date(`${v}Z`).toISOString(),
          1184: (v: string) => new Date(v).toISOString(),
        },
      });
      const ready = await db.query<{ ok: boolean }>("select to_regclass('public.erp_products') is not null as ok");
      if (!ready.rows[0].ok) {
        await db.exec("do $$ begin create role anon; create role authenticated; create role service_role; exception when duplicate_object then null; end $$;");
      }
      for (const file of ERP_MIGRATIONS) await db.exec(readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8"));
      return db as unknown as Db;
    })();
  }
  return shared.__erpLocalDb;
}

function toError(error: unknown): Result["error"] {
  const e = error as { message?: string; detail?: string; code?: string };
  return { message: e.message ?? "db", details: e.detail, code: e.code };
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name: string) => {
  if (!IDENT.test(name)) throw new Error(`bad identifier ${name}`);
  return name;
};

class Query implements PromiseLike<Result> {
  private columns = "*";
  private filters: { sql: string; value?: unknown; after?: string }[] = [];
  private orders: string[] = [];
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(private table: string) {}

  select(columns = "*") {
    this.columns = columns === "*" ? "*" : columns.split(",").map((c) => ident(c.trim())).join(", ");
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} = $`, value });
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} <= $`, value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ sql: `${ident(column)} >= $`, value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ sql: `${ident(column)} = any($`, value: values, after: ")" });
    return this;
  }
  is(column: string, value: null) {
    if (value !== null) throw new Error("only is(null)");
    this.filters.push({ sql: `${ident(column)} is null` });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push(`${ident(column)} ${options?.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private async run(): Promise<Result> {
    await localNetworkDelay();
    try {
      const params: unknown[] = [];
      const where = this.filters.map((f) => {
        if (!f.sql.endsWith("$")) return f.sql;
        params.push(f.value);
        return `${f.sql}${params.length}${f.after ?? ""}`;
      });
      const sql =
        `select ${this.columns} from public.${ident(this.table)}` +
        (where.length ? ` where ${where.join(" and ")}` : "") +
        (this.orders.length ? ` order by ${this.orders.join(", ")}` : "") +
        (this.max ? ` limit ${Math.floor(this.max)}` : "");
      const { rows } = await (await getDb()).query(sql, params);
      if (this.mode === "many") return { data: rows, error: null };
      if (this.mode === "single" && rows.length !== 1) return { data: null, error: { message: "single row expected" } };
      return { data: rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }

  then<A = Result, B = never>(onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(onFulfilled, onRejected);
  }
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
  await localNetworkDelay();
  try {
    const names = Object.keys(args);
    const values = names.map((name) => {
      const value = args[name];
      return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
    });
    const call = names.map((name, index) => `${ident(name)} => $${index + 1}`).join(", ");
    const { rows } = await (await getDb()).query(`select public.${ident(fn)}(${call}) as result`, values);
    return { data: rows[0]?.result ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

export const localErpClient = {
  from: (table: string) => new Query(table),
  rpc,
};
