# Release 3 — SQL migrations (apply order)

**Do not rewrite** previously tested migration files without technical necessity.  
**Do not apply to production** until Phase 10H owner confirmation.

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20261127090000_erp_r3_sales_output_vat.sql` | 9B |
| 2 | `supabase/migrations/20261127091000_erp_r3_sales_rpcs.sql` | 9B |
| 3 | `supabase/migrations/20261127100000_erp_r3_input_vat_register.sql` | 9C |
| 4 | `supabase/migrations/20261127101000_erp_r3_input_vat_rpcs.sql` | 9C |
| 5 | `supabase/migrations/20261127110000_erp_r3_platform_settlements.sql` | 9D |
| 6 | `supabase/migrations/20261127111000_erp_r3_platform_rpcs.sql` | 9D |
| 7 | `supabase/migrations/20261127120000_erp_r3_vat_settlement.sql` | 9E |
| 8 | `supabase/migrations/20261127121000_erp_r3_vat_settlement_rpcs.sql` | 9E |
| 9 | `supabase/migrations/20261127130000_erp_r3_sales_bom_cogs.sql` | 9F |
| 10 | `supabase/migrations/20261127131000_erp_r3_sales_bom_cogs_rpcs.sql` | 9F |
| 11 | `supabase/migrations/20261127132000_erp_r3_profitability_rpcs.sql` | 9F |
| 12 | `supabase/migrations/20261127140000_erp_r3_opex_assets_pnl.sql` | 9G |
| 13 | `supabase/migrations/20261127141000_erp_r3_opex_pnl_rpcs.sql` | 9G |
| 14 | `supabase/migrations/20261127150000_erp_r3_financial_periods.sql` | 9H |
| 15 | `supabase/migrations/20261127151000_erp_r3_financial_periods_rpcs.sql` | 9H |

Verified on restored local copy `gastrofood_r3_phase10` (Phase 10E Free Path).
