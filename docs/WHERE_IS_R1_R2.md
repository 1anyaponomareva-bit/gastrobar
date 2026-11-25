# Where is Release 1 / Release 2 — verified (not assumed)

**Checked:** 2026-11-25  
**Release 3:** not started.  
**Method:** live production JS string scan + PostgREST schema probes against `ulxmubivimwxevgxxxyu` (anon key; read-only).  
**Artifacts:** `docs/assets/r1-r2-where-fe.json`

---

## 1. Git map (verified)

| Ref | Tip | Contents |
|-----|-----|----------|
| `origin/main` | `3ad1c1c` | Release 1 Phase 3–7 **code** + Phase 8A **docs only**. No 8B–hardening. |
| `origin/erp-inventory` | `03e9f90` | Everything on main **plus** Phase 8B–8G + pre-prod hardening + UX/RU fixes |

R2 commits exist **only** on `erp-inventory` (`7ffb798`…`d568e2d` + later UX).

---

## 2. Production frontend `https://gastrofood.vn/erp` (verified)

| Probe | Result |
|-------|--------|
| `financialCalculator` in JS bundles | **Present** |
| `Recommended Selling Price` (EN, as on `main`) | **Present** |
| `Рекомендуемая цена продажи` (RU fix on branch) | **Absent** |
| `Costing Policy` / `Корректировки НДС` / `Остатки / FIFO` | **Absent** |
| `/erp/stock/vat-adjustments` | Matched as `/erp/stock/[kind]` — **not** R2 page |

**Conclusion:** Production FE includes **Release 1 Phase 6–7** (channel finance / calculator), aligned with **`main`**, **not** latest `erp-inventory`.  
**Release 2 FE is not published** on production.

Preview `gastrobar-git-erp-inventory-…vercel.app`: **Vercel SSO** — authenticated FE not opened by agent this pass; expected to track branch tip after deploy, still unverified in-browser.

---

## 3. Production database `ulxmubivimwxevgxxxyu` (verified via PostgREST errors)

Interpretation of codes:

- `42501` permission denied → **object exists**, anon blocked (RLS/grants)
- `42703` → **column missing**
- `PGRST205` → **table missing**
- `PGRST202` → **function missing**

### Release 1 (Phase 3–5 SQL) — **present**

| Object | Result |
|--------|--------|
| `erp_tax_rates` | EXISTS (`42501`) |
| `erp_vat_exceptions` | EXISTS (`42501`) |
| `erp_sales_channels` + `commission_rate`, `advertising_rate`, `finance_preliminary`, `target_margin_pct`, `commission_vat_rate`, `advertising_vat_rate` | EXISTS (`42501`) |
| `erp_settings.input_vat_enabled` / `output_vat_enabled` / `default_output_vat_rate` | EXISTS (`42501`) |
| `erp_documents.prices_include_vat` | EXISTS (`42501`) |
| `erp_document_lines.vat_rate` | EXISTS (`42501`) |
| `erp_lots.unit_cost` | EXISTS (`42501`) |

Phase 6–7 have **no required SQL** beyond Phase 3–5 (frontend + existing channel columns).

### Release 2 (8B–hardening) — **not applied**

| Object | Result |
|--------|--------|
| `erp_settings.recipe_cost_source` | **MISSING_COLUMN** |
| `erp_settings.vat_adj_allow_backdated` | **MISSING_COLUMN** |
| `erp_document_lines.vat_deduction_status` | **MISSING_COLUMN** |
| `erp_documents.vat_invoice_number` | **MISSING_COLUMN** |
| `erp_lots.input_vat_rate` / `tax_status_known` | **MISSING_COLUMN** |
| `erp_vat_cost_adjustments` | **MISSING_TABLE** |
| `erp_dish_cost_snapshots` | **MISSING_TABLE** |
| `erp_production_lot_lineage` | **MISSING_TABLE** |
| `erp_tax_rate_percent_allowed` RPC | **MISSING_FUNCTION** |

---

## 4. Where each capability lives

| Capability | Code location | Production FE | Production DB | User-visible on gastrofood.vn |
|------------|---------------|---------------|---------------|-------------------------------|
| Phase 3 Tax catalog | `main` + branch | Yes (service taxes) | Yes | Yes (after admin login) |
| Phase 4 VAT exceptions | `main` + branch | Yes | Yes | Yes |
| Phase 5 Channel finance settings | `main` + branch | Yes | Yes | Yes |
| Phase 6 Calculator | `main` + branch | **Yes** (in bundles) | N/A (TS) | Yes on dish card |
| Phase 7 Dish CM / Recommended price | `main` + branch | **Yes** (EN labels as on main) | N/A | Yes — Меню → блюдо → Каналы продаж |
| Phase 8B Purchase Input VAT (full) | **branch only** | No | **No** | No |
| Phase 8C Lot VAT / FIFO tax | **branch only** | No | **No** | No |
| Phase 8D VAT adjustments UI/SQL | **branch only** | No | **No** | No |
| Phase 8E Production lineage | **branch only** | No | **No** | No |
| Phase 8F Costing Policy / snapshots | **branch only** | No | **No** | No |
| Pre-prod hardening | **branch only** | No | **No** | No |
| UX discoverability + RU finance labels | **branch only** (`3c28279`+) | No | N/A | No on prod |

---

## 5. Why production “looks old” for R2, but not for all of R1

1. **R2** is only on `erp-inventory` and was never merged/published — confirmed by missing FE strings **and** missing DB objects.  
2. **R1 Phase 6–7** *are* on production FE — confirmed by live `financialCalculator` + `Recommended Selling Price`. Earlier acceptance docs saying “deploy awaiting” are **outdated relative to current production bundles**.  
3. Opening production without knowing paths (or without login) still hides Phase 7 inside the dish card.

---

## 6. Still blocked / not fully verified

| Item | Status |
|------|--------|
| Authenticated UI screenshots of production dish finance | Login wall for agent |
| Preview FE after SSO | SSO gate |
| Exact Vercel deployment git SHA for production | No API token; FE fingerprint matches `main` Phase 7, not latest branch |
| SERVICE_ROLE in local env | Empty placeholder — cannot dump full `schema_migrations` list |

---

## 7. Next steps (still no Release 3)

1. Owner: open production Danish Hot Dog → confirm Phase 7 panel.  
2. Owner: open Preview (SSO) → confirm R2 nav (Корректировки НДС, Costing Policy).  
3. Non-prod clone + apply 8B→hardening before any production SQL.  
4. Only then: production SQL + FE publish of `erp-inventory`.  

**Do not start Release 3** until the above publish path is complete and accepted.
