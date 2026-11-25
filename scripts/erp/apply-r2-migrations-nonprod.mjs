/**
 * Safety gate for Release 2 SQL apply on a NON-PRODUCTION Supabase project.
 *
 * This script does NOT connect by itself (no `pg` dependency). It verifies
 * environment guards and prints the exact migration order for the operator.
 *
 * Required:
 *   ERP_SUPABASE_PROJECT_REF   — must NOT be production ulxmubivimwxevgxxxyu
 *   ERP_ALLOW_NONPROD_APPLY=1
 *
 * Optional:
 *   ERP_ALLOWED_NONPROD_REFS   — comma list of allowed staging refs
 *
 * Apply migrations in Supabase SQL editor / CLI against THAT project only.
 * Never point Vercel Preview stock tests at production.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PRODUCTION_REF = "ulxmubivimwxevgxxxyu";
const FILES = [
  "20261125150000_erp_purchase_input_vat.sql",
  "20261125160000_erp_lots_input_vat_fifo.sql",
  "20261125170000_erp_vat_cost_adjustment.sql",
  "20261125180000_erp_production_cost_lineage.sql",
  "20261125190000_erp_recipe_costing.sql",
  "20261125200000_erp_r2_preprod_hardening.sql",
];

const ref = (process.env.ERP_SUPABASE_PROJECT_REF || "").trim();
const allow = process.env.ERP_ALLOW_NONPROD_APPLY === "1";
const allowed = (process.env.ERP_ALLOWED_NONPROD_REFS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function die(msg) {
  console.error("REFUSED:", msg);
  process.exit(2);
}

if (!allow) die("Set ERP_ALLOW_NONPROD_APPLY=1 to acknowledge non-prod-only apply.");
if (!ref) die("Set ERP_SUPABASE_PROJECT_REF to the staging/clone project ref.");
if (ref === PRODUCTION_REF) die(`Ref ${ref} is PRODUCTION — blocked.`);
if (allowed.length && !allowed.includes(ref)) {
  die(`Ref ${ref} not listed in ERP_ALLOWED_NONPROD_REFS.`);
}

console.log("OK — non-prod gate passed.");
console.log("Project ref:", ref);
console.log("Dashboard:", `https://supabase.com/dashboard/project/${ref}/sql/new`);
console.log("\nApply these files IN ORDER (SQL editor or supabase db execute):\n");
for (const file of FILES) {
  const full = path.join(process.cwd(), "supabase/migrations", file);
  if (!existsSync(full)) die(`Missing ${file}`);
  const bytes = readFileSync(full).byteLength;
  console.log(`  ${file}  (${bytes} bytes)`);
}
console.log(`
Post-apply smoke (on the SAME non-prod project):
  select recipe_cost_source, vat_adj_allow_backdated from erp_settings where id=1;
  -- expect recipe_cost_source=manual_estimated, vat_adj_allow_backdated=false
  select public.erp_tax_rate_percent_allowed(7, null, null);  -- false
  select public.erp_tax_rate_percent_allowed(8, null, 'standard'); -- true
`);
