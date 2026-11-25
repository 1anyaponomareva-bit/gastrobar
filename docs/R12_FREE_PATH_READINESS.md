# R1→R2 Free-path readiness (local non-prod)

**Checked at:** 2026-11-25  
**Plan:** Supabase Free (no Pro). **Production SQL / merge / Release 3:** not started.  
**SpiceSpace:** not used for R2.

---

## Done on this PC

| Step | Result |
|------|--------|
| DB password (CDP Generate→Copy→Reset) | OK → `.env.db.local` (gitignored) |
| `pg_dump` prod `ulxmubivimwxevgxxxyu` | OK — PG **17** client (server 17.6) |
| Dump path | `C:\Users\Nikita Ponomarev\GASTROBAR-backups\prod-ulxmubivimwxevgxxxyu-2026-11-25T07-59-17-518Z.dump` |
| Integrity | `bytes=1281323`, `pg_restore -l` OK (`list_lines=1250`) |
| Non-prod restore | Local PostgreSQL **16** DB `gastrofood_r2_copy` @ `127.0.0.1:5432` (password local-only) |
| Roles shim | `anon` / `authenticated` / `service_role` created for grant/revoke |
| R2 migrations 1→6 | **All OK** on copy only |

### Migrations applied (copy only)

1. `20261125150000_erp_purchase_input_vat.sql`  
2. `20261125160000_erp_lots_input_vat_fifo.sql`  
3. `20261125170000_erp_vat_cost_adjustment.sql`  
4. `20261125180000_erp_production_cost_lineage.sql`  
5. `20261125190000_erp_recipe_costing.sql`  
6. `20261125200000_erp_r2_preprod_hardening.sql`  

Recorded in `supabase_migrations.schema_migrations` on the **local** copy.

---

## Smoke (local copy)

| Check | Result |
|-------|--------|
| `erp_business_today()` | `2026-11-25` |
| `erp_effective_inventory_cost(100,10,'deductible',100,0)` | `100` |
| `erp_effective_inventory_cost(100,10,'non_deductible',0,0)` | `110` |
| `erp_effective_inventory_cost(..., allocated_acq=5)` | `105` |
| `erp_split_purchase_vat(10,'partial',50)` | `(5,5,0)` |
| `erp_vat_adj_preview('{}')` | guard `ERP_INVALID` / `source_line_id` (**expected**) |
| Tables | `erp_vat_cost_adjustments`, `erp_document_acquisition_costs`, `erp_production_lot_components`, `erp_dish_cost_snapshots` present |
| Settings | `erp_settings.recipe_cost_source` present |
| Data still present after restore | dishes=1, lots=1, recipes=9, channels=5 |

Artifacts: `GASTROBAR-backups\r2-smoke-fns.txt`, `r2-migrate-local.json`, dump `.meta.json`.

---

## Environment notes

- **Docker Desktop:** installed but engine **cannot start** — **WSL not installed** on this Windows. Local PG used instead of `npx supabase start`.
- **PG17 full server install:** incomplete (installer UAC cancel); **pg_dump 17.12** binaries available and used for dump.
- **Prod:** untouched — no R2 SQL, no merge, no deploy.

---

## Ready for owner final OK

Agent requests **one** explicit OK to:

1. Apply the same six R2 migrations on **production** SQL (project `ulxmubivimwxevgxxxyu`), then  
2. Merge / publish FE for R2 (branch `erp-inventory` → agreed target),  

Still **out of scope** until separate OK: Release 3, sale-price/history/stock mass changes, SpiceSpace for R2.
