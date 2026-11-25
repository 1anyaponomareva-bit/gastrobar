# Release 1 & 2 — Blockers: Backup & Non-Production DB

**Checked:** 2026-11-25 via authenticated Supabase Dashboard (Chrome CDP)  
**Project:** `ulxmubivimwxevgxxxyu` (PRODUCTION) · Org plan: **FREE**  
**Agent actions:** read-only. No upgrades, no branch create, no production SQL.

Evidence screenshots: `docs/assets/r12-pitr.png`, `r12-scheduled-backups.png`, `r12-create-branch-dialog.png`.

---

## Blocker A — Production backup / PITR

### Verified status

| Item | Result |
|------|--------|
| Org / project plan | **FREE** |
| Scheduled backups | **Not included** — UI: «Free Plan does not include project backups. Upgrade to the Pro Plan for up to 7 days of scheduled backups.» |
| Point-in-Time Recovery | **Not available** — UI: «Point in Time Recovery is a Pro Plan add-on» (from $100/mo) |
| Last restore point timestamp | **None** (no backup product active) |
| Restore production DB from Dashboard backups | **Not possible** on Free |

**Conclusion:** Backup blocker is **NOT cleared**. Publishing R2 SQL without a restore path is **unsafe**.

### What you must do (owner)

#### Option A1 — Recommended: upgrade to Pro (enables real backups)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → organization **1anyaponomareva-bit's Org**.  
2. Go to **Organization → Billing** (or click **Upgrade to Pro** on the Backups page).  
3. Choose **Pro** for the organization and complete payment.  
4. Open production project → **Database → Backups → Scheduled backups**.  
5. Confirm that daily backups are listed (Pro includes up to **7 days**).  
6. (Optional but strongly recommended before merge) **Database → Backups → Point in time** → enable PITR add-on if you want second-level restore.  
7. Reply with:
   - Plan now = Pro (yes/no)  
   - Latest scheduled backup date/time (or “daily midnight region”)  
   - PITR enabled (yes/no)

After Pro is active, agent can re-open the same pages and **confirm** the restore point in writing.

#### Option A2 — Interim: logical dump (if you refuse Pro for now)

This is weaker than PITR but better than nothing:

1. Project → **Project Settings → Database** → reset/copy **Database password** if needed.  
2. From a machine with network access to the DB:
   ```bash
   pg_dump "postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
     --format=custom --file=gastrofood-prod-pre-r2.dump
   ```
3. Store the file offline; note file size + UTC timestamp.  
4. Send agent: dump completed (yes) + timestamp + approximate size (no password).

Without A1 or A2, **do not** apply production SQL.

---

## Blocker B — Non-production database

### Verified status

| Item | Result |
|------|--------|
| Branching UI | Present: **Branching → Create branch** |
| Create branch dialog | **«Upgrade to unlock branching»** + **Upgrade to Pro** |
| Preview branch on Free | **Blocked** by plan |
| Restore to new project | Page opens (BETA); Free has **no** scheduled backups to restore from |

**Conclusion:** Non-prod clone via Branch is **NOT** available until Pro (or you create a separate project another way).

### What you must do (owner)

#### Option B1 — Recommended after Pro: create Preview Branch

1. Ensure org is **Pro** (same as A1).  
2. Open production project → left nav **Branching**.  
3. Click **Create branch** / **Create a preview branch**.  
4. Parameters:
   - **Preview branch name:** `r2-preprod` (or similar)  
   - **Sync with GitHub:** leave **off** for now  
5. Confirm create (note compute is billed hourly while branch exists — dialog shows ~$0.01344/h).  
6. Wait until branch status is ready.  
7. Open the **branch** project → **Project Settings → General** → copy **Project ID / ref** (must ≠ `ulxmubivimwxevgxxxyu`).  
8. **Project Settings → API**: copy URL + `service_role` (secret).  
9. Send agent:
   - `ERP_SUPABASE_PROJECT_REF=<branch-ref>`  
   - Confirm service role can be placed in a local env file / you paste into a one-time apply session  
10. Agent will then apply migrations **1→6** only on that ref and run smoke tests (never on production).

#### Option B2 — Without Branch: new empty Free project + schema apply

Use only if you want migration smoke **without** production-like data:

1. Org home → **New project**.  
2. Name: `gastrofood-r2-staging`. Region: **Southeast Asia (Singapore)** (same as prod if possible).  
3. Set a strong DB password; save it.  
4. Wait until project is healthy.  
5. Send agent the new **project ref** + service role (or open SQL Editor yourself).  
6. Agent applies R2 migrations 1→6 on the **new** project only.  
   - Limitation: this does **not** clone live lots/receipts; it validates SQL/RPC, not full data parity.  
7. For stronger test later: after Pro, prefer B1.

#### Option B3 — Existing secondary project `SpiceSpace`

Org already lists **SpiceSpace** (`ap-northeast-1`). Only reuse if you confirm it is disposable / not production for another app. Reply **yes/no** before any migrations there.

---

## Production frontend rollback fingerprint (for later deploy)

See `docs/assets/r12-prod-fe-fingerprint.json`.  
Current production FE ≈ `main` / R1 Phase 6–7 (no R2). Rollback = previous Vercel production deployment of project under `annas-projects-183a79d7`.

---

## What happens after you clear A + B

1. Agent re-verifies Backup page (Pro backups visible) and notes restore point.  
2. Agent applies six R2 migrations on **non-prod only** + SQL/RPC/RLS/stock smoke.  
3. Then ask again for **one final OK** on production SQL + merge + FE deploy.

**Not done now:** production SQL, merge, Release 3, feature work.
