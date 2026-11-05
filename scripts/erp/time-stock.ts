/**
 * Warehouse speed measurements on an isolated PGlite copy (never production).
 * Also models PostgREST round trips (delay + optional connection cap).
 *
 *   npx tsx scripts/erp/time-stock.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createTestDb } from "./testDb";

const LOAD_STATE_SQL = path.join(process.cwd(), "supabase/migrations/20261106011500_erp_speed_load_state.sql");
const ACTOR = "speed@gastrofood";
const RTT_MS = 200;
const HTTP1_CAP = 6;

type Db = Awaited<ReturnType<typeof createTestDb>>;

const ms = (t0: number) => Math.round(performance.now() - t0);

async function minOf(times: number, work: () => Promise<number>): Promise<{ min: number; runs: number[] }> {
  const runs: number[] = [];
  for (let i = 0; i < times; i += 1) runs.push(await work());
  return { min: Math.min(...runs), runs };
}

async function pool<T>(cap: number, jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= jobs.length) return;
      out[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(cap, jobs.length) }, () => worker()));
  return out;
}

function delay(msValue: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, msValue));
}

async function withRtt<T>(rtt: number, work: () => Promise<T>): Promise<T> {
  const [value] = await Promise.all([work(), delay(rtt)]);
  return value;
}

const PART_SQL: Record<string, string[]> = {
  settings: ["select * from public.erp_settings where id = 1"],
  categories: ["select * from public.erp_categories order by sort"],
  suppliers: ["select * from public.erp_suppliers order by sort"],
  warehouses: ["select * from public.erp_warehouses order by sort"],
  channels: ["select * from public.erp_sales_channels order by sort"],
  products: ["select * from public.erp_products order by name_en limit 5000"],
  packs: ["select * from public.erp_packs where archived_at is null limit 10000"],
  productPacks: ["select * from public.erp_product_packs where archived_at is null limit 10000"],
  stock: ["select * from public.erp_stock limit 20000"],
  writeoffReasons: ["select * from public.erp_writeoff_reasons order by sort"],
  recipes: ["select * from public.erp_recipes order by version", "select * from public.erp_recipe_lines order by line_no limit 20000"],
  dishes: [
    "select * from public.erp_dishes order by name_en",
    "select * from public.erp_dish_lines order by line_no limit 20000",
    "select * from public.erp_dish_channel_prices",
  ],
};

const ALL = Object.keys(PART_SQL);
const STOCK = ALL.filter((part) => part !== "recipes" && part !== "dishes");

async function runParts(db: Db, parts: string[], rtt: number, cap: number | null) {
  const jobs = parts.flatMap((part) => PART_SQL[part].map((sql) => () => withRtt(rtt, () => db.query(sql))));
  const t0 = performance.now();
  if (cap) await pool(cap, jobs);
  else await Promise.all(jobs.map((job) => job()));
  return ms(t0);
}

async function seed(db: Db) {
  const warehouse = (await db.query<{ id: string }>("select id from public.erp_warehouses order by sort limit 1")).rows[0];
  assert.ok(warehouse);
  await db.query(
    `insert into public.erp_products (code, type, name_en, name_vn, base_unit, created_by)
     select 'speed-' || g, 'ingredient', 'Speed product ' || g, '', 'kg', $1 from generate_series(1, 120) g`,
    [ACTOR],
  );
  await db.query(
    `insert into public.erp_packs (name, unit, qty_base, created_by)
     select 'pack ' || g, 'kg', g, $1 from generate_series(1, 40) g`,
    [ACTOR],
  );
  await db.query(
    `insert into public.erp_product_packs (product_id, pack_id, label, qty_base, is_default)
     select p.id, k.id, k.name, k.qty_base, true
     from (select id, row_number() over (order by name_en) as rn from public.erp_products) p
     join (select id, name, qty_base, row_number() over (order by name) as rn, count(*) over () as n from public.erp_packs where archived_at is null) k
       on k.rn = 1 + ((p.rn - 1) % k.n)`,
  );

  await db.query(
    `insert into public.erp_recipes (product_id, version, status, yield_qty, created_by)
     select id, 1, 'draft', 1, $1 from public.erp_products order by name_en limit 24`,
    [ACTOR],
  );
  await db.query(
    `insert into public.erp_recipe_lines (recipe_id, line_no, product_id, qty)
     select r.id, g, p.id, 1
     from public.erp_recipes r
     cross join generate_series(0, 5) g
     join (
       select id, row_number() over (order by name_en) as rn, count(*) over () as n
       from public.erp_products
       where id not in (select product_id from public.erp_recipes)
     ) p on p.rn = 1 + (g % p.n)`,
  );

  await db.query(
    `insert into public.erp_dishes (code, name_en, name_vn, created_by)
     select 'speed-dish-' || g, 'Speed dish ' || g, 'Speed dish ' || g, $1 from generate_series(0, 19) g`,
    [ACTOR],
  );
  await db.query(
    `insert into public.erp_dish_lines (dish_id, line_no, product_id, qty)
     select d.id, g, p.id, 1
     from (select id, row_number() over (order by code) as rn from public.erp_dishes where code like 'speed-dish-%') d
     cross join generate_series(0, 3) g
     join (select id, row_number() over (order by name_en) as rn, count(*) over () as n from public.erp_products) p
       on p.rn = 1 + ((d.rn + g) % p.n)`,
  );
  await db.query(
    `insert into public.erp_dish_channel_prices (dish_id, channel_id, sale_price)
     select d.id, c.id, 10000
     from public.erp_dishes d
     cross join (select id from public.erp_sales_channels order by sort limit 3) c
     where d.code like 'speed-dish-%'`,
  );

  await db.query(
    `insert into public.erp_documents (doc_no, doc_type, status, doc_date, warehouse_id, created_by)
     select 'SPD-' || g,
            (array['receipt','transfer','writeoff','opening'])[1 + ((g - 1) % 4)],
            'draft', current_date, $1, $2
     from generate_series(1, 180) g`,
    [warehouse.id, ACTOR],
  );
  await db.query(
    `insert into public.erp_document_lines (document_id, line_no, product_id, qty)
     select d.id, g, p.id, 1
     from (select id, row_number() over (order by doc_no) as rn from public.erp_documents where doc_no like 'SPD-%') d
     cross join generate_series(0, 3) g
     join (select id, row_number() over (order by name_en) as rn, count(*) over () as n from public.erp_products) p
       on p.rn = 1 + ((d.rn + g) % p.n)`,
  );

  const source = (await db.query<{ id: string }>("select id from public.erp_documents where doc_no = 'SPD-1'")).rows[0];
  await db.query(
    `insert into public.erp_lots (product_id, warehouse_id, source_document_id, received_at, unit_cost, qty_in, qty_left)
     select p.id, w.id, $1, now(), 10000, 5, 5
     from public.erp_products p
     cross join (select id from public.erp_warehouses order by sort limit 2) w
     limit 160`,
    [source.id],
  );
}

async function measureFetchCap() {
  const server = http.createServer((_req, res) => {
    setTimeout(() => {
      res.end("ok");
    }, RTT_MS);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;
  const n = 16;
  const tAll = performance.now();
  await Promise.all(Array.from({ length: n }, () => fetch(url)));
  const unconstrained = ms(tAll);
  const tCap = performance.now();
  await pool(
    HTTP1_CAP,
    Array.from({ length: n }, () => () => fetch(url).then(() => undefined)),
  );
  const capped = ms(tCap);
  server.close();
  return { unconstrained, capped, n, rttMs: RTT_MS, cap: HTTP1_CAP };
}

async function assertLoadState(db: Db) {
  await db.exec(readFileSync(LOAD_STATE_SQL, "utf8"));
  const state = (await db.query<{ s: Record<string, unknown> }>("select public.erp_load_state(null) as s")).rows[0].s;
  const products = state.products as unknown[];
  const recipes = state.recipes as { lines: unknown[] }[];
  const dishes = state.dishes as { lines: unknown[]; channel_prices: unknown[] }[];
  const nProducts = Number((await db.query<{ n: number }>("select count(*)::int as n from public.erp_products")).rows[0].n);
  const nRecipes = Number((await db.query<{ n: number }>("select count(*)::int as n from public.erp_recipes")).rows[0].n);
  const nDishes = Number((await db.query<{ n: number }>("select count(*)::int as n from public.erp_dishes")).rows[0].n);
  assert.equal(products.length, nProducts);
  assert.equal(recipes.length, nRecipes);
  assert.equal(dishes.length, nDishes);
  assert.ok(recipes.every((recipe) => Array.isArray(recipe.lines)));
  assert.ok(dishes.every((dish) => Array.isArray(dish.lines) && Array.isArray(dish.channel_prices)));
  const stock = (await db.query<{ s: Record<string, unknown> }>("select public.erp_load_state($1) as s", ["stock,products"])).rows[0].s;
  assert.deepEqual(Object.keys(stock).sort(), ["products", "stock"]);
  return {
    bytesAll: Buffer.byteLength(JSON.stringify(state)),
    bytesStock: Buffer.byteLength(JSON.stringify(stock)),
    counts: {
      products: nProducts,
      recipes: nRecipes,
      dishes: nDishes,
      recipeLines: recipes.reduce((n, recipe) => n + recipe.lines.length, 0),
      stock: (state.stock as unknown[]).length,
      documents: Number((await db.query<{ n: number }>("select count(*)::int as n from public.erp_documents")).rows[0].n),
    },
  };
}

async function main() {
  console.log(JSON.stringify({ fetchCap: await measureFetchCap() }));

  const db = await createTestDb();
  await seed(db);
  const countsBeforeFn = {
    products: Number((await db.query<{ n: number }>("select count(*)::int as n from public.erp_products")).rows[0].n),
    documents: Number((await db.query<{ n: number }>("select count(*)::int as n from public.erp_documents")).rows[0].n),
  };

  const compute = await minOf(3, async () => {
    const t0 = performance.now();
    await Promise.all(ALL.flatMap((part) => PART_SQL[part].map((sql) => db.query(sql))));
    return ms(t0);
  });
  const computeStock = await minOf(3, async () => {
    const t0 = performance.now();
    await Promise.all(STOCK.flatMap((part) => PART_SQL[part].map((sql) => db.query(sql))));
    return ms(t0);
  });
  const sequential = await minOf(2, async () => {
    const t0 = performance.now();
    for (const part of ALL) for (const sql of PART_SQL[part]) await db.query(sql);
    return ms(t0);
  });

  const parallelRtt = await minOf(2, () => runParts(db, ALL, RTT_MS, null));
  const cappedRtt = await minOf(2, () => runParts(db, ALL, RTT_MS, HTTP1_CAP));
  const stockCappedRtt = await minOf(2, () => runParts(db, STOCK, RTT_MS, HTTP1_CAP));
  const oneQueryRtt = await minOf(2, async () => {
    const t0 = performance.now();
    await withRtt(RTT_MS, () => db.query("select 1"));
    return ms(t0);
  });

  const receiptsIds = (await db.query<{ id: string }>("select id from public.erp_documents where doc_type in ('receipt', 'opening') order by created_at desc limit 250")).rows.map(
    (row) => row.id,
  );
  const chunk = 100;
  const receiptChunks = Array.from({ length: Math.ceil(receiptsIds.length / chunk) }, (_, i) => receiptsIds.slice(i * chunk, i * chunk + chunk));
  const receiptsSeq = await minOf(2, async () => {
    const t0 = performance.now();
    await withRtt(RTT_MS, () => db.query("select id from public.erp_documents where doc_type in ('receipt', 'opening') limit 251"));
    for (const ids of receiptChunks) {
      await withRtt(RTT_MS, () => db.query("select document_id from public.erp_document_lines where document_id = any($1)", [ids]));
    }
    return ms(t0);
  });
  const receiptsPar = await minOf(2, async () => {
    const t0 = performance.now();
    await withRtt(RTT_MS, () => db.query("select id from public.erp_documents where doc_type in ('receipt', 'opening') limit 251"));
    await Promise.all(
      receiptChunks.map((ids) => withRtt(RTT_MS, () => db.query("select document_id from public.erp_document_lines where document_id = any($1)", [ids]))),
    );
    return ms(t0);
  });

  const checked = await assertLoadState(db);
  const batchedCompute = await minOf(3, async () => {
    const t0 = performance.now();
    await db.query("select public.erp_load_state(null)");
    return ms(t0);
  });
  const batchedRtt = await minOf(2, async () => {
    const t0 = performance.now();
    await withRtt(RTT_MS, () => db.query("select public.erp_load_state(null)"));
    return ms(t0);
  });

  console.log(
    JSON.stringify(
      {
        catalog: "synthetic 120 products (live catalog size was not returned on 401)",
        seed: countsBeforeFn,
        checked,
        computeMs: { all: compute, stock: computeStock, sequential, batched: batchedCompute },
        rttMs: RTT_MS,
        modeled: {
          allParallel: parallelRtt,
          allHttp1Cap6: cappedRtt,
          stockHttp1Cap6: stockCappedRtt,
          oneQuery: oneQueryRtt,
          batched: batchedRtt,
          receiptsSequentialChunks: receiptsSeq,
          receiptsParallelChunks: receiptsPar,
          receiptDocs: receiptsIds.length,
          receiptChunks: receiptChunks.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
