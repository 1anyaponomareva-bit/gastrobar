/**
 * Read-only: where is R1/R2 functionality (DB objects + FE fingerprint notes).
 * Does NOT apply migrations or mutate data.
 *
 * Usage: node --env-file=.env.vercel.local scripts/erp/verify-r1-r2-where.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const ref = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] || "unknown";
const PRODUCTION_REF = "ulxmubivimwxevgxxxyu";

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function probe(name, fn) {
  try {
    const r = await fn();
    return { name, ...r };
  } catch (e) {
    return { name, ok: false, error: String(e?.message || e) };
  }
}

const checks = [];

checks.push(
  await probe("r1_tax_rates", async () => {
    const { data, error, count } = await sb.from("erp_tax_rates").select("id", { count: "exact", head: true });
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, count };
  }),
);

checks.push(
  await probe("r1_vat_exceptions", async () => {
    const { error, count } = await sb.from("erp_vat_exceptions").select("id", { count: "exact", head: true });
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, count };
  }),
);

checks.push(
  await probe("r1_sales_channels_finance", async () => {
    const { data, error } = await sb
      .from("erp_sales_channels")
      .select("code, commission_rate, advertising_rate, finance_preliminary, target_margin_pct")
      .limit(10);
    if (error) return { ok: false, code: error.code, message: error.message };
    return {
      ok: true,
      channels: (data || []).map((c) => ({
        code: c.code,
        has_commission: c.commission_rate != null,
        has_ads: c.advertising_rate != null,
        preliminary: c.finance_preliminary,
        target_margin_pct: c.target_margin_pct,
      })),
    };
  }),
);

checks.push(
  await probe("r1_settings_vat_flags", async () => {
    const { data, error } = await sb
      .from("erp_settings")
      .select("input_vat_enabled, output_vat_enabled, default_input_vat_rate, default_output_vat_rate, recipe_cost_source, vat_adj_allow_backdated")
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, code: error.code, message: error.message, hint: "missing columns => migration not applied" };
    return { ok: true, settings: data };
  }),
);

checks.push(
  await probe("r2_vat_cost_adjustments_table", async () => {
    const { error, count } = await sb.from("erp_vat_cost_adjustments").select("id", { count: "exact", head: true });
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, count };
  }),
);

checks.push(
  await probe("r2_lots_input_vat_cols", async () => {
    const { data, error } = await sb
      .from("erp_lots")
      .select("id, unit_cost, input_vat_rate, vat_deduction_status, tax_status_known")
      .limit(1);
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, sample_keys: data?.[0] ? Object.keys(data[0]) : [] };
  }),
);

checks.push(
  await probe("r2_document_lines_vat_deduction", async () => {
    const { data, error } = await sb
      .from("erp_document_lines")
      .select("id, vat_rate, vat_deduction_status, vat_included")
      .limit(1);
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, sample_keys: data?.[0] ? Object.keys(data[0]) : [] };
  }),
);

checks.push(
  await probe("r2_rpc_erp_tax_rate_percent_allowed", async () => {
    const { data, error } = await sb.rpc("erp_tax_rate_percent_allowed", { p_percent: 8 });
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, data };
  }),
);

checks.push(
  await probe("r2_dish_cost_snapshots", async () => {
    const { error, count } = await sb.from("erp_dish_cost_snapshots").select("id", { count: "exact", head: true });
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true, count };
  }),
);

checks.push(
  await probe("schema_migrations_if_exposed", async () => {
    const { data, error } = await sb.from("schema_migrations").select("version").order("version");
    if (error) {
      const { data: d2, error: e2 } = await sb.schema("supabase_migrations").from("schema_migrations").select("version").order("version");
      if (e2) return { ok: false, code: error.code, message: error.message, alt: e2.message };
      return { ok: true, source: "supabase_migrations.schema_migrations", versions: (d2 || []).map((x) => x.version) };
    }
    return { ok: true, source: "public.schema_migrations", versions: (data || []).map((x) => x.version) };
  }),
);

const out = {
  checked_at: new Date().toISOString(),
  supabase_ref: ref,
  is_production_ref: ref === PRODUCTION_REF,
  mode: "read_only",
  checks,
  summary: {
    r1_phase3_tax_rates: checks.find((c) => c.name === "r1_tax_rates")?.ok === true,
    r1_phase4_exceptions: checks.find((c) => c.name === "r1_vat_exceptions")?.ok === true,
    r1_phase5_channels: checks.find((c) => c.name === "r1_sales_channels_finance")?.ok === true,
    r2_settings_recipe_cost_source:
      checks.find((c) => c.name === "r1_settings_vat_flags")?.ok === true &&
      checks.find((c) => c.name === "r1_settings_vat_flags")?.settings?.recipe_cost_source !== undefined,
    r2_vat_adj_table: checks.find((c) => c.name === "r2_vat_cost_adjustments_table")?.ok === true,
    r2_lot_vat_cols: checks.find((c) => c.name === "r2_lots_input_vat_cols")?.ok === true,
    r2_hardening_rpc: checks.find((c) => c.name === "r2_rpc_erp_tax_rate_percent_allowed")?.ok === true,
    r2_dish_snapshots: checks.find((c) => c.name === "r2_dish_cost_snapshots")?.ok === true,
  },
};

writeFileSync("docs/assets/r1-r2-where-verify.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
