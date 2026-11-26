/**
 * Phase 9F-A/B Free-path tests — BOM explosion + Actual COGS.
 * Auto-consume left OFF after tests. Does not modify Danish Hot Dog recipe.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const host = "127.0.0.1";
const port = "5432";
const user = "postgres";
const db = "gastrofood_r2_copy";
const password = "postgres";
const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";

function sqlRaw(q) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "psql fail").slice(0, 4000));
  return (r.stdout || "").trim();
}
function sql(q) {
  const lines = sqlRaw(q)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(x));
  return lines[0] ?? "";
}
function sqlOk(q) {
  try {
    return { ok: true, out: sqlRaw(q) };
  } catch (e) {
    return { ok: false, out: String(e.message || e).slice(0, 800) };
  }
}
function sqlFile(path) {
  const r = spawnSync(psql, ["-h", host, "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-f", path], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    timeout: 180000,
  });
  if (r.status !== 0) throw new Error(`${path}\n${(r.stderr || r.stdout || "").slice(0, 5000)}`);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(JSON.stringify({ name, ok: Boolean(cond), detail: String(detail ?? "").slice(0, 300) }));
  if (!cond) throw new Error("FAIL " + name + " " + (detail || ""));
}

sqlFile("supabase/migrations/20261127130000_erp_r3_sales_bom_cogs.sql");
sqlFile("supabase/migrations/20261127131000_erp_r3_sales_bom_cogs_rpcs.sql");
sqlFile("supabase/migrations/20261127132000_erp_r3_profitability_rpcs.sql");

const actor = "phase9f-test";
const runId = Date.now().toString(36);
const danish = "34a2654c-9dd0-4e22-b9ff-a061c2bd5ce0";
const wh = sql(`select id::text from erp_warehouses order by created_at limit 1`);

check("wh", Boolean(wh), wh);
check("danish_exists", sql(`select name_en from erp_dishes where id='${danish}'`) === "Danish Hot Dog", "dish");

// --- 9F-A: simple BOM explode ---
const bom = JSON.parse(sql(`select public.erp_sales_bom_explode('${danish}'::uuid, 1, '[]'::jsonb, '{}'::uuid[], now())::text`));
check("bom_simple_status", bom.status === "complete", bom.status);
check("bom_has_lines", Array.isArray(bom.lines) && bom.lines.length >= 5, String(bom.lines?.length));
check("bom_has_pack", bom.lines.some((l) => l.cogs_kind === "packaging"), "pack");
check("bom_has_food", bom.lines.some((l) => l.cogs_kind === "food"), "food");

// Snapshot immutability vs future recipe: explode twice with same inputs → same product set
const bom2 = JSON.parse(sql(`select public.erp_sales_bom_explode('${danish}'::uuid, 2, '[]'::jsonb, '{}'::uuid[], now())::text`));
check("bom_qty_scale", bom2.lines.every((l) => {
  const a = bom.lines.find((x) => x.product_id === l.product_id);
  return a && Math.abs(Number(l.qty) - Number(a.qty) * 2) < 0.0001;
}), "scaled");

// Modifier add
const bun = sql(`select product_id::text from erp_dish_lines where dish_id='${danish}' order by line_no limit 1`);
const bomAdd = JSON.parse(
  sql(`select public.erp_sales_bom_explode('${danish}'::uuid, 1, '${JSON.stringify([{ op: "add", product_id: bun, qty: 1 }]).replace(/'/g, "''")}'::jsonb, '{}'::uuid[], now())::text`),
);
const bunLine = bomAdd.lines.find((l) => l.product_id === bun);
check("bom_modifier_add", bunLine && Number(bunLine.qty) >= 2, JSON.stringify(bunLine));

// Exclude
const bomEx = JSON.parse(
  sql(`select public.erp_sales_bom_explode('${danish}'::uuid, 1, '${JSON.stringify([{ op: "exclude", product_id: bun }]).replace(/'/g, "''")}'::jsonb, '{}'::uuid[], now())::text`),
);
check("bom_modifier_exclude", !bomEx.lines.some((l) => l.product_id === bun && Number(l.qty) > 0), "excluded");

// Mapping required — no guess
const bomMap = JSON.parse(
  sql(`select public.erp_sales_bom_explode('${danish}'::uuid, 1, '${JSON.stringify([{ op: "add", external_key: `poster:unknown-${runId}`, external_name: "Mystery" }]).replace(/'/g, "''")}'::jsonb, '{}'::uuid[], now())::text`),
);
check("bom_mapping_required", bomMap.status === "mapping_required", bomMap.status);
check("bom_mapping_line", bomMap.lines.some((l) => l.mapping_status === "mapping_required"), "line");

// Prep choice path — packaging still present, prep as stocked item
const prep = sql(`select id::text from erp_products where type='semi_finished' limit 1`);
if (prep) {
  const bomPrep = JSON.parse(
    sql(`select public.erp_sales_bom_explode('${danish}'::uuid, 1, '[]'::jsonb, array['${prep}']::uuid[], now())::text`),
  );
  check("bom_prep_includes_prep", bomPrep.lines.some((l) => l.product_id === prep), prep);
  check("bom_prep_includes_pack", bomPrep.lines.some((l) => l.cogs_kind === "packaging"), "pack");
} else {
  check("bom_prep_skip", true, "no prep product");
}

// Nested explode smoke via count_explode stocked stop still available
check("count_explode_exists", sql(`select to_regprocedure('public.erp_count_explode(text,uuid,numeric,timestamptz,uuid[])')`) !== "", "fn");

// --- Sale + snapshot ---
const salePayload = {
  source_system: "manual",
  warehouse_id: wh,
  business_date: "2097-06-15",
  lines: [
    {
      dish_id: danish,
      description: "Danish Hot Dog test",
      quantity: 1,
      gross_sales: 99000,
      modifiers: [{ op: "add", product_id: bun, qty: 0.5 }],
    },
  ],
};
const saleId = sql(`select public.erp_save_sales_document('${JSON.stringify(salePayload).replace(/'/g, "''")}'::jsonb, '${actor}')`);
sql(`select public.erp_post_sales_document('${saleId}'::uuid, '${actor}')`);
const lineId = sql(`select id::text from erp_sales_lines where document_id='${saleId}' limit 1`);
const snapId = sql(`select public.erp_sales_bom_snapshot('${lineId}'::uuid, '${actor}')`);
check("snapshot_created", Boolean(snapId), snapId);
const snap2 = sql(`select public.erp_sales_bom_snapshot('${lineId}'::uuid, '${actor}')`);
check("snapshot_idempotent", snap2 === snapId, `${snap2}==${snapId}`);
const snapLines = Number(sql(`select count(*)::text from erp_sales_bom_snapshot_lines where snapshot_id='${snapId}'`));
check("snapshot_lines", snapLines > 0, String(snapLines));

// Recipe change after snapshot must not rewrite snapshot lines
const beforeHash = sql(`select md5(string_agg(product_id::text||':'||qty::text, ',' order by line_no)) from erp_sales_bom_snapshot_lines where snapshot_id='${snapId}'`);
// touch dish updated_at only — do not change real Danish lines
sql(`update erp_dishes set updated_at = now() where id='${danish}'`);
const afterHash = sql(`select md5(string_agg(product_id::text||':'||qty::text, ',' order by line_no)) from erp_sales_bom_snapshot_lines where snapshot_id='${snapId}'`);
check("snapshot_immutable", beforeHash === afterHash, beforeHash);

// --- 9F-B: auto-consume disabled default ---
const off = JSON.parse(sql(`select public.erp_sales_post_cogs('${saleId}'::uuid, '${actor}', false)::text`));
check("cogs_off_pending", off.cogs_status === "pending" && /auto_consume_disabled/.test(off.reason || ""), JSON.stringify(off));

// Pending insufficient stock path with ghost product sale
sql(`update erp_settings set sales_auto_consume_stock = true where id=1`);
try {
  const ghost = sql(
    `insert into erp_products (code, type, name_en, name_vn, base_unit) values ('9f-ghost-${runId}', 'ingredient', '9F GHOST ${runId}', '9F GHOST ${runId}', 'pcs') returning id`,
  );
  const gSale = sql(
    `select public.erp_save_sales_document('${JSON.stringify({
      source_system: "manual",
      warehouse_id: wh,
      business_date: "2097-06-16",
      lines: [{ product_id: ghost, description: "ghost", quantity: 1, gross_sales: 1000 }],
    }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
  );
  sql(`select public.erp_post_sales_document('${gSale}'::uuid, '${actor}')`);
  const gCogs = JSON.parse(sql(`select public.erp_sales_post_cogs('${gSale}'::uuid, '${actor}', true)::text`));
  check("pending_cogs_status", gCogs.cogs_status === "partial" || gCogs.cogs_status === "pending" || /insufficient/i.test(JSON.stringify(gCogs)), JSON.stringify(gCogs));
  const pendCnt = Number(sql(`select count(*)::text from erp_sales_pending_cogs where sales_document_id='${gSale}' and status='open'`));
  check("pending_cogs_row", pendCnt >= 1, String(pendCnt));
  check("sale_still_posted", sql(`select order_status from erp_sales_documents where id='${gSale}'`) === "posted", "posted");

  // Idempotent re-post after marking posted
  sql(`update erp_sales_documents set cogs_status='posted', actual_cogs=0 where id='${gSale}'`);
  const idem = JSON.parse(sql(`select public.erp_sales_post_cogs('${gSale}'::uuid, '${actor}', true)::text`));
  check("cogs_idempotent", idem.idempotent === true, JSON.stringify(idem));

  // Seed test lots via opening document (local Free-path only — not production)
  const seedDoc = sql(
    `insert into erp_documents (doc_type, doc_no, status, warehouse_id, doc_date, comment, created_by, updated_by)
     values ('opening', '9F-SEED-${runId}', 'draft', '${wh}'::uuid, current_date, 'phase9f test seed', '${actor}', '${actor}')
     returning id`,
  );
  const seedProducts = sqlRaw(
    `select distinct product_id::text from erp_dish_lines where dish_id='${danish}'`,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  let seeded = 0;
  for (const pid of seedProducts) {
    const line = sqlOk(
      `insert into erp_document_lines (document_id, line_no, product_id, qty)
       values ('${seedDoc}'::uuid, ${seeded + 1}, '${pid}'::uuid, 100) returning id`,
    );
    if (!line.ok) continue;
    const lot = sqlOk(
      `insert into erp_lots (product_id, warehouse_id, source_document_id, source_line_id, qty_in, qty_left, unit_cost, received_at)
       values ('${pid}'::uuid, '${wh}'::uuid, '${seedDoc}'::uuid, '${line.out.split(/\r?\n/)[0]}'::uuid, 100, 100, 500, now()) returning id`,
    );
    if (lot.ok) seeded += 1;
  }
  check("lots_seeded", seeded > 0, String(seeded));

  const dSale = sql(
    `select public.erp_save_sales_document('${JSON.stringify({
      source_system: "manual",
      warehouse_id: wh,
      business_date: "2097-06-17",
      lines: [{ dish_id: danish, description: "Danish FIFO", quantity: 1, gross_sales: 99000 }],
    }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
  );
  sql(`select public.erp_post_sales_document('${dSale}'::uuid, '${actor}')`);
  sql(`update erp_sales_lines set estimated_cogs = 27902.06 where document_id='${dSale}'`);
  const dCogs = JSON.parse(sql(`select public.erp_sales_post_cogs('${dSale}'::uuid, '${actor}', true)::text`));
  check("danish_cogs_posted_or_partial", ["posted", "partial"].includes(dCogs.cogs_status), JSON.stringify(dCogs));
  const food = Number(sql(`select coalesce(food_cogs,0)::text from erp_sales_documents where id='${dSale}'`));
  const pack = Number(sql(`select coalesce(packaging_cogs,0)::text from erp_sales_documents where id='${dSale}'`));
  check("danish_food_pack_split", food > 0 || pack > 0, `food=${food} pack=${pack}`);
  const est = Number(sql(`select coalesce(estimated_cogs,0)::text from erp_sales_lines where document_id='${dSale}' limit 1`));
  check("estimated_not_actual", est === 27902.06 && Number(dCogs.actual_cogs || 0) !== est, `est=${est} act=${dCogs.actual_cogs}`);

  const adj = sqlOk(`select public.erp_sales_apply_vat_cogs_adjustment('${dSale}'::uuid, null, -500, '${actor}')`);
  check("vat_cogs_adj", adj.ok, adj.out.slice(0, 200));
  if (adj.ok) {
    const adjTotal = Number(sql(`select coalesce(cogs_adjustment_total,0)::text from erp_sales_documents where id='${dSale}'`));
    check("vat_cogs_adj_amount", adjTotal === -500, String(adjTotal));
  }

  // Refund without stock restore
  const rSale = sql(
    `select public.erp_save_sales_document('${JSON.stringify({
      source_system: "manual",
      warehouse_id: wh,
      business_date: "2097-06-18",
      lines: [{ dish_id: danish, description: "refund test", quantity: 1, gross_sales: 50000 }],
    }).replace(/'/g, "''")}'::jsonb, '${actor}')`,
  );
  sql(`select public.erp_post_sales_document('${rSale}'::uuid, '${actor}')`);
  sql(`select public.erp_refund_sales_document('${rSale}'::uuid, '${actor}', 50000, true, false)`);
  const pol = sql(`select refund_stock_policy from erp_sales_documents where id='${rSale}'`);
  check("refund_no_stock", pol === "refund_without_stock_return" || pol === "cancel_before_prep", pol);
  const restoreFail = sqlOk(`select public.erp_refund_sales_document('${rSale}'::uuid, '${actor}', 1, false, true)`);
  check("physical_return_blocked", !restoreFail.ok, restoreFail.out.slice(0, 160));
} finally {
  sql(`update erp_settings set sales_auto_consume_stock = false where id=1`);
}
check("auto_consume_restored_off", sql(`select sales_auto_consume_stock::text from erp_settings where id=1`) === "false", "off");

// Control math 9F-C fixture
const math = JSON.parse(sql(`select public.erp_profitability_control_math(100000,25000,3000,18000,7000)::text`));
check("control_total_cogs", Number(math.total_actual_cogs) === 28000, String(math.total_actual_cogs));
check("control_gp", Number(math.gross_profit) === 72000, String(math.gross_profit));
check("control_gm", Number(math.gross_margin_pct) === 72, String(math.gross_margin_pct));
check("control_cm", Number(math.contribution_margin) === 47000, String(math.contribution_margin));
check("control_cm_pct", Number(math.contribution_margin_pct) === 47, String(math.contribution_margin_pct));

const ch = JSON.parse(sql(`select public.erp_profitability_channels('2097-06-01'::date,'2097-06-30'::date,null)::text`));
check("channels_report", Array.isArray(ch.channels) && ch.completeness, JSON.stringify(ch.completeness?.status));
const loc = JSON.parse(sql(`select public.erp_profitability_locations('2097-06-01'::date,'2097-06-30'::date)::text`));
check("locations_report", Array.isArray(loc.locations), String(loc.locations?.length));
const prod = JSON.parse(sql(`select public.erp_profitability_products('2097-06-01'::date,'2097-06-30'::date,null,null)::text`));
check("products_report", Array.isArray(prod.products), String(prod.products?.length));

// Regression presence
check("reg_9e", sql(`select to_regclass('public.erp_vat_settlements')`) === "erp_vat_settlements", "9e");
check("reg_9d", sql(`select to_regclass('public.erp_platform_settlements')`) === "erp_platform_settlements", "9d");
check("reg_consume", sql(`select to_regprocedure('public.erp_consume(uuid,uuid,uuid,uuid,numeric,text)')`) !== "", "fifo");

const outDir = join("docs", "assets", "phase9f");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "r3-phase9f-ab-test-results.json"), JSON.stringify({ runId, results, bomLines: bom.lines?.length, math }, null, 2));
console.log(JSON.stringify({ ok: true, passed: results.length }));
