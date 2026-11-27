# Release 3 — Stable Production Pin

| Item | Value |
|------|--------|
| **Pinned git commit** | **`1c23863`** |
| **Status** | Stable production freeze (owner accepted UI periods fix) |
| **Live ERP** | https://gastrofood.vn/erp |
| **Date** | 2026-11-27 |

## Included at pin

- Release 3 finance modules (9B–9H) on production schema + FE  
- Financial periods navigation fix (sidebar visibility)  
- Permanent **Poster POS ↔ ERP sync ban** (API-enforced)  
- Auto-consume **OFF**

## Standing rules

- Do **not** apply further production SQL without separate owner OK (including proposed Poster RPC guard).  
- Do **not** start Release 4 until owner instructs.  
- Do **not** enable auto-consume without separate owner OK.  
- Poster Auto-Sync / live Poster→ERP integration: **FORBIDDEN BY OWNER** (architecture-level).

## Related

- `docs/RELEASE3_UI_FIX_POSTER_BAN.md`  
- `docs/PROPOSED_SQL_POSTER_ERP_SYNC_FORBIDDEN.md` (SQL **not** applied)  
- `docs/RELEASE3_BACKLOG.md`  
- `docs/RELEASE3_FINANCIAL_ARCHITECTURE.md` § Poster ban  
