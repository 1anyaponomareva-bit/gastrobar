# Release 1 & 2 — Free-plan backup & preprod path

**Decision:** stay on Supabase **Free** (no Pro).  
**SpiceSpace:** not used for R2.  
**Production SQL / merge:** not started.

---

## Current blockers on the agent machine (verified)

| Tool / access | Status |
|---------------|--------|
| Supabase org plan | FREE — no scheduled backups / no PITR / branching locked |
| `SUPABASE_DB_PASSWORD` in local env | **Missing** |
| `pg_dump` / PostgreSQL client | **Not installed** (winget installer hung on GUI; aborted) |
| Docker Desktop | **Not installed** |
| Free project slots | Org already has **2** projects (production + SpiceSpace). Free limit = 2 active → new cloud staging needs pausing SpiceSpace **or** use local Docker |

Agent **cannot** finish dump/migrate alone until you complete §1–§2 below.

---

## 1. Your actions — database password (required)

1. Open https://supabase.com/dashboard/project/ulxmubivimwxevgxxxyu/settings/database  
2. Click **Reset database password** → save the password in a password manager.  
3. In the repo root create **`.env.db.local`** (gitignored; **do not** paste into chat):

```env
SUPABASE_DB_PASSWORD=...
SUPABASE_DB_HOST=db.ulxmubivimwxevgxxxyu.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER=postgres
SUPABASE_DB_NAME=postgres
```

If direct host fails from your network, use Session pooler host/user from the same Database settings page (user form `postgres.<ref>`).

4. Reply: **`DB password готов`**.

---

## 2. Your actions — tools (required for free path)

### Preferred: Local Supabase (Docker)

1. Install **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/  
2. Start Docker Desktop until it shows running.  
3. Install PostgreSQL **command-line tools** (for `pg_dump`):  
   - Option A: run the PostgreSQL 16 Windows installer from https://www.postgresql.org/download/windows/ and enable **Command Line Tools**.  
   - Option B: complete/cancel any stuck EDB installer window if it appeared, then finish install manually.  
4. Reply: **`Docker готов`** (and that `pg_dump --version` works in a new terminal).

### Alternative without Docker: free cloud staging

1. Pause **SpiceSpace** (not delete): project → Settings → **Pause project**.  
   (We still will **not** apply R2 SQL to SpiceSpace.)  
2. Org → **New project** → name `gastrofood-r2-staging`, region **Singapore**.  
3. Put staging password in `.env.db.staging.local` (gitignored).  
4. Reply: **`Staging ref=<ref>`** and **`Staging DB password готов`**.

---

## 3. What agent does next (after your replies)

1. Run `node scripts/erp/pg-dump-prod-free.mjs` → dump under `~/GASTROBAR-backups/` (outside git).  
2. Verify dump (`pg_restore -l`, size).  
3. Restore into local Supabase **or** staging project.  
4. Apply migrations 1→6 **only** on that copy.  
5. SQL/RPC / RLS / FIFO / VAT / costing smoke.  
6. Brief readiness report + request final OK for production SQL + merge + deploy.

Auth: dump includes `auth` schema when using full DB dump.  
Storage: DB rows dump; binary objects in Storage buckets need separate export only if ERP relies on them for R2 acceptance (attachments) — check after dump TOC.

---

## Scripts

- `scripts/erp/free-plan-dump-restore.md` — short checklist  
- `scripts/erp/pg-dump-prod-free.mjs` — dump once password + pg_dump exist  

**No secrets in git. No Pro. No production SQL until final OK.**
