# Release 2 — Production freeze & owner acceptance

**Accepted by owner:** 2026-11-25  
**Technical publish:** complete  
**Stable production commit:** `c3e0b15` (`c3e0b159a66080b059ef2086fcb56e01249a1876`)  
**Live ERP:** https://gastrofood.vn/erp  

---

## Freeze rules (do not break without new owner OK)

| Keep | Value |
|------|--------|
| Supabase plan | **Free** (no Pro unless separately approved) |
| Costing policy | **`manual_estimated`** |
| Stock costing method | **FIFO** for actual warehouse issues |
| Sale prices | **Do not change** existing prices |
| Historical cost | **Do not recalculate** |
| Tech cards & stock data | **Do not rewrite** existing recipes / balances |
| SpiceSpace | **Not used** for R2 |
| Release 3 | **Not started** until separate technical assignment |

**No further Release 1 / Release 2 code or SQL changes** without a concrete necessity and owner direction.

---

## Preserved artifacts

### Documentation
- `docs/R2_PRODUCTION_DEPLOY_REPORT.md` — publish report (SQL, FE, smoke, UI paths)
- `docs/R12_FREE_PATH_READINESS.md` — Free-path dry-run readiness
- `docs/R12_FREE_PLAN_BACKUP_PATH.md` — Free backup path notes
- `docs/RELEASE2_ACCEPTANCE_REPORT.md` — pre-prod acceptance (historical)
- This file — freeze + acceptance

### Backup (outside git)
- `C:\Users\Nikita Ponomarev\GASTROBAR-backups\prod-ulxmubivimwxevgxxxyu-2026-11-25T08-27-02-380Z.dump`
- Meta: same basename `.meta.json` — **1 281 323** bytes, `list_ok`
- Apply log: `…\r2-prod-apply-2026-11-25T08-28-36-220Z.json`

### Test / UI evidence (local assets)
- `…\assets\r2-prod-*.png` and `r2-prod-*.json` (CDP authenticated shots)

### Git tag
- `r2-production-c3e0b15` → commit `c3e0b15` (stable production pin)

---

## Next

1. **Owner / user UI verification** of the live interface (agent waits).  
2. **Release 3** — only after a separate technical assignment.  
3. Destructive DB restore — only with explicit separate confirmation.
