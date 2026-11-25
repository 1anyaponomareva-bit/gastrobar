# Owner action required — Supabase Pro payment

**Status:** Org `1anyaponomareva-bit's Org` (`plxisvrratzutzdhfurr`) is still **FREE**.  
Agent opened the subscription panel; **card payment must be completed by you** (agent will not enter card data).

Production DB was **not** changed. SpiceSpace was **not** used.

---

## Do this now (in your already logged-in Chrome)

1. Open:  
   https://supabase.com/dashboard/org/plxisvrratzutzdhfurr/billing?panel=subscriptionPlan&source=backups
2. In the plan panel, click **Upgrade to Pro** ($25/mo).  
3. If asked about spend cap — leave as you prefer (for production ERP, disabling spend cap is safer against read-only mode).  
4. Add / confirm **Payment method**, then confirm subscription.  
5. Wait until org badge is no longer **FREE**.  
6. Open production project → **Database → Backups → Scheduled backups** — text «Free Plan does not include…» must **disappear**.  
7. Reply in chat with only: **`Pro активен`** (no keys).

---

## After your reply, agent will automatically

1. Re-verify scheduled backups / restore capability.  
2. Create preview branch **`r2-preprod`** (not SpiceSpace).  
3. Check schema parity vs production.  
4. Apply Release 2 migrations **1→6 only on `r2-preprod`**.  
5. Run SQL/RPC/RLS/FIFO/costing smoke on preprod.  
6. Wire Vercel Preview env to preprod via Dashboard/CLI (secrets not in git/chat).  
7. Report readiness — still waiting for your final OK before production SQL / merge / deploy.

Scripts ready (local CDP):  
`scripts/erp/after-pro-create-r2-preprod-cdp.mjs`
