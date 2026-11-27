/**
 * Local Free-path tests: Poster POS ↔ ERP sync ban (SQL hardening).
 * DB: gastrofood_r2_copy. Does not touch production.
 */
import { spawnSync } from "node:child_process";

const psql = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const db = "gastrofood_r2_copy";
const env = { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" };

function sql(q, expectFail = false) {
  const r = spawnSync(
    psql,
    ["-h", "127.0.0.1", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", q],
    { encoding: "utf8", env, timeout: 60000 }
  );
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  if (expectFail) {
    if (r.status === 0) throw new Error(`expected fail, got ok: ${out.slice(0, 400)}\nQ=${q.slice(0, 200)}`);
    return { ok: false, err: err || out };
  }
  if (r.status !== 0) throw new Error(`sql fail: ${err || out}\nQ=${q.slice(0, 300)}`);
  return { ok: true, out };
}

function mustContain(err, code) {
  if (!String(err).includes(code)) throw new Error(`expected ${code} in: ${String(err).slice(0, 800)}`);
}

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log("OK", name);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e).slice(0, 500) });
    console.error("FAIL", name, e.message || e);
  }
}

check("detector_aliases", () => {
  const q = `
    select
      public.erp_is_poster_erp_source('poster')::text,
      public.erp_is_poster_erp_source('poster_pos')::text,
      public.erp_is_poster_erp_source('poster-api')::text,
      public.erp_is_poster_erp_source('joinposter')::text,
      public.erp_is_poster_erp_source('poster.import')::text,
      public.erp_is_poster_erp_source('poster_sync')::text,
      public.erp_is_poster_erp_source('grab')::text,
      public.erp_is_poster_erp_source('manual')::text,
      public.erp_is_poster_erp_source('import')::text
  `;
  const { out } = sql(q);
  const parts = out.split("|");
  if (parts.length < 9) throw new Error("bad row " + out);
  const [a, b, c, d, e, f, g, h, i] = parts;
  const isTrue = (x) => x === "t" || x === "true";
  const isFalse = (x) => x === "f" || x === "false";
  if (![a, b, c, d, e, f].every(isTrue)) throw new Error("aliases false: " + out);
  if (![g, h, i].every(isFalse)) throw new Error("non-poster true: " + out);
});

check("assert_blocks_poster", () => {
  const { err } = sql(`select public.erp_assert_poster_erp_sync_forbidden('poster')`, true);
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("assert_blocks_alias", () => {
  const { err } = sql(`select public.erp_assert_poster_erp_sync_forbidden('poster_pos')`, true);
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("assert_allows_manual", () => {
  sql(`select public.erp_assert_poster_erp_sync_forbidden('manual')`);
});

check("assert_allows_grab", () => {
  sql(`select public.erp_assert_poster_erp_sync_forbidden('grab')`);
});

check("historical_poster_readable", () => {
  const { out } = sql(`select count(*)::text from public.erp_sales_documents where source_system = 'poster'`);
  if (Number(out) < 1) throw new Error("expected historical poster rows, got " + out);
});

check("direct_insert_poster_blocked", () => {
  const { err } = sql(
    `
    insert into public.erp_sales_documents (
      legal_entity_id, source_system, business_date, order_at, currency, canonical_order_key, created_by
    )
    select le.id, 'poster', current_date, now(), 'THB', 'forbid-' || gen_random_uuid()::text, 'test'
    from public.erp_legal_entities le
    limit 1
  `,
    true
  );
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("direct_insert_poster_pos_alias_blocked", () => {
  const { err } = sql(
    `
    insert into public.erp_sales_documents (
      legal_entity_id, source_system, business_date, order_at, currency, canonical_order_key, created_by
    )
    select le.id, 'poster_pos', current_date, now(), 'THB', 'forbid-' || gen_random_uuid()::text, 'test'
    from public.erp_legal_entities le
    limit 1
  `,
    true
  );
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("direct_insert_poster_payload_blocked", () => {
  const { err } = sql(
    `
    insert into public.erp_sales_documents (
      legal_entity_id, source_system, business_date, order_at, currency, canonical_order_key, poster_payload, created_by
    )
    select le.id, 'manual', current_date, now(), 'THB', 'forbid-' || gen_random_uuid()::text, '{"x":1}'::jsonb, 'test'
    from public.erp_legal_entities le
    limit 1
  `,
    true
  );
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("link_source_poster_blocked", () => {
  const { out: sid } = sql(`select id::text from public.erp_sales_documents where source_system='manual' and deleted_at is null limit 1`);
  if (!sid) throw new Error("no manual sale");
  const { err } = sql(
    `select public.erp_sales_link_source('${sid}'::uuid, 'poster', 'ext-forbid-1', '_', 'manual', '{}'::jsonb, 'test-actor')`,
    true
  );
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("import_stub_poster_blocked", () => {
  const { err } = sql(
    `select public.erp_sales_import_stub_validate('poster', '[]'::jsonb, 'test-actor', 'poster.csv')`,
    true
  );
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("import_stub_grab_allowed", () => {
  const { out } = sql(
    `select public.erp_sales_import_stub_validate('grab', '[]'::jsonb, 'test-actor', 'grab.csv')::text`
  );
  if (!/^[0-9a-f-]{36}$/i.test(out)) throw new Error("bad uuid " + out);
  sql(`delete from public.erp_sales_import_batches where id = '${out}'::uuid`);
});

check("manual_save_allowed", () => {
  const { out: entity } = sql(`select id::text from public.erp_legal_entities order by created_at nulls last limit 1`);
  if (!entity) throw new Error("no legal entity");
  const payload = JSON.stringify({
    legal_entity_id: entity,
    source_system: "manual",
    status: "draft",
    business_date: new Date().toISOString().slice(0, 10),
    order_at: new Date().toISOString(),
    currency: "THB",
    lines: [],
  }).replace(/'/g, "''");
  const { out } = sql(`select public.erp_save_sales_document('${payload}'::jsonb, 'test-actor')::text`);
  if (!/^[0-9a-f-]{36}$/i.test(out)) throw new Error("bad uuid " + out);
  sql(`delete from public.erp_sales_documents where id = '${out}'::uuid`);
});

check("save_poster_blocked", () => {
  const { out: entity } = sql(`select id::text from public.erp_legal_entities order by created_at nulls last limit 1`);
  const payload = JSON.stringify({
    legal_entity_id: entity,
    source_system: "poster",
    status: "draft",
    business_date: new Date().toISOString().slice(0, 10),
    order_at: new Date().toISOString(),
    currency: "THB",
    lines: [],
  }).replace(/'/g, "''");
  const { err } = sql(`select public.erp_save_sales_document('${payload}'::jsonb, 'test-actor')`, true);
  mustContain(err, "ERP_POSTER_SYNC_FORBIDDEN");
});

check("historical_poster_update_non_sync_ok", () => {
  const { out: id } = sql(`select id::text from public.erp_sales_documents where source_system='poster' limit 1`);
  if (!id) throw new Error("no poster row");
  sql(`update public.erp_sales_documents set updated_at = now() where id = '${id}'::uuid`);
});

check("restore_guc_allows_write", () => {
  sql(`
    begin;
    set local erp.allow_poster_historical_write = 'on';
    insert into public.erp_sales_documents (
      legal_entity_id, source_system, business_date, order_at, currency, canonical_order_key, created_by
    )
    select le.id, 'poster', current_date, now(), 'THB', 'restore-' || gen_random_uuid()::text, 'restore-test'
    from public.erp_legal_entities le
    limit 1;
    delete from public.erp_sales_documents where created_by = 'restore-test' and source_system = 'poster';
    commit;
  `);
});

check("rpc_grants_service_role_only", () => {
  const q = `
    select
      has_function_privilege('anon', 'public.erp_assert_poster_erp_sync_forbidden(text)', 'execute')::text,
      has_function_privilege('authenticated', 'public.erp_assert_poster_erp_sync_forbidden(text)', 'execute')::text,
      has_function_privilege('service_role', 'public.erp_assert_poster_erp_sync_forbidden(text)', 'execute')::text,
      has_function_privilege('anon', 'public.erp_sales_link_source(uuid,text,text,text,text,jsonb,text)', 'execute')::text,
      has_function_privilege('service_role', 'public.erp_sales_link_source(uuid,text,text,text,text,jsonb,text)', 'execute')::text
  `;
  const { out } = sql(q);
  const [a, b, c, d, e] = out.split("|");
  const isTrue = (x) => x === "t" || x === "true";
  const isFalse = (x) => x === "f" || x === "false";
  if (!isFalse(a) || !isFalse(b) || !isTrue(c) || !isFalse(d) || !isTrue(e)) throw new Error("grants: " + out);
});

check("triggers_present", () => {
  const { out } = sql(`
    select count(*)::text from pg_trigger
    where tgname in ('erp_poster_sync_forbid_ins','erp_poster_sync_forbid_upd')
      and not tgisinternal
  `);
  if (Number(out) < 6) throw new Error("expected >=6 triggers, got " + out);
});

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);
