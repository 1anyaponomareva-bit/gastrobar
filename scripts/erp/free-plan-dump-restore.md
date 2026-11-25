# Free-plan backup & preprod (no Supabase Pro)

Secrets stay in **gitignored** local files only. Never paste passwords into chat or git.

## A. Provide DB password (owner, once)

1. Chrome → Supabase → project `ulxmubivimwxevgxxxyu` → **Project Settings → Database**.  
2. **Reset database password** → copy the new password into a password manager.  
   - Note: resets break existing direct connections until apps/use new password.  
3. On this PC create file **`.env.db.local`** in the repo root (already gitignored via `.env*.local`):

```env
SUPABASE_DB_PASSWORD=...your password...
SUPABASE_DB_HOST=db.ulxmubivimwxevgxxxyu.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
# optional pooler (Session mode) if direct host blocked:
# SUPABASE_DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
# SUPABASE_DB_PORT=5432
# SUPABASE_DB_USER=postgres.ulxmubivimwxevgxxxyu
```

4. Reply in chat only: **`DB password готов`** (do not send the password).

## B. Install tools on this PC (if not already)

1. **PostgreSQL client** (`pg_dump` / `pg_restore`) — installing via winget if needed.  
2. **Docker Desktop** — required for local Supabase restore+migrate.  
   Download: https://www.docker.com/products/docker-desktop/  
   Install, start Docker, reply: **`Docker готов`**.

## C. Free cloud staging (optional alternative to Docker)

Free org limit = **2 active projects** (production + SpiceSpace already).  
To create `gastrofood-r2-staging` without Pro:

1. Pause **SpiceSpace** (Settings → Pause) — we still will **not** run R2 migrations on SpiceSpace.  
2. **New project** → name `gastrofood-r2-staging`, region Singapore.  
3. Reply: **`Staging ref = <project-ref>`** and put staging DB password in `.env.db.staging.local` (gitignored).

Preferred path remains **local Docker** so SpiceSpace can stay untouched.

## D. What agent runs after A+B

1. `pg_dump` production → `C:/Users/.../GASTROBAR-backups/` (outside git).  
2. Verify dump with `pg_restore -l` / file size.  
3. `npx supabase start` + restore dump into local DB.  
4. Apply migrations 1→6 on local only.  
5. SQL/RPC/FIFO/VAT smoke.  
6. Report + request final OK for production SQL/merge/deploy.
