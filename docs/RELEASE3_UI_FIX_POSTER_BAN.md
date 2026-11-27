# Release 3 — UI Fix & Permanent Poster Ban

**Date:** 2026-11-27  
**Branch:** `release-3-final` → `main` (production publish)

## 1. Financial periods menu

**Root cause:** Finance sidebar submenu used `overflow: hidden` inside a clipped `1fr` grid track, so lower items (including «Финансовые периоды») were cut off and only reachable by direct URL.

**Fix:**
- Sidebar open state uses `max-content` + visible overflow so the full list scrolls in `.erpSideNav`.
- Menu order: «Финансовые периоды» and «Журнал аудита» placed near the top (after Продажи / Расходы).
- Route `/erp/finance/periods` unchanged; RU label «Финансовые периоды».

### Exact path

**Финансы → Финансовые периоды**  
Direct: https://gastrofood.vn/erp/finance/periods

## 2. Poster POS — FORBIDDEN BY OWNER

| Rule | Status |
|------|--------|
| Auto-sync / live API pull into ERP | **FORBIDDEN** |
| New sales with `source_system=poster` via ERP API | **Blocked** (403 `ERP_POSTER_SYNC_FORBIDDEN`) |
| Poster source link / poster import stub via ERP API | **Blocked** |
| Historical poster-sourced rows | **Kept** (read) |
| Grab / manual / generic import | **Allowed** |
| Guest `poster-test` app | Unrelated to ERP sync; not used as ERP integration |
| SQL DB-level guard | **APPLIED** — `20261127160000_erp_r3_poster_erp_sync_forbidden.sql` (`docs/RELEASE3_POSTER_SQL_BAN_APPLIED.md`) |

Server module: `src/lib/erp/posterErpSyncForbidden.ts`  
Enforced in: `app/api/erp/action/route.ts`

## 3. Constraints

- Auto-consume remains **OFF**
- No price / recipe / stock / finance document changes
- No Release 4
- No unapproved production SQL

## 4. Tests

- `node --import tsx --test src/lib/erp/posterErpSyncForbidden.test.ts`
- `npm run typecheck`
