# Auto-Consume Activation Plan (Release 3)

**Current production/default:** `sales_auto_consume_stock = false`  
**Do not enable without explicit owner OK.**

## Preconditions

1. Owner written approval + go-live **date** (no historical backfill).  
2. Warehouses and lots ready for dish BOM ingredients.  
3. Dish recipes / prep cards complete for menu items sold after go-live.  
4. Free-path soak: BOM + FIFO + idempotent re-post + insufficient stock + refunds + prep stop + parallel post.  
5. Monitoring: pending COGS queue, negative stock alerts.

## Activation steps

1. Fresh backup.  
2. Set `sales_auto_consume_stock=true` **only for posts with business_date ≥ go-live**.  
3. Keep historical sales pending/manual COGS.  
4. First week: daily pending COGS review.  
5. Rollback: set flag `false` (does not un-consume; reverse via refund/cancel rules only).

## Explicit non-goals

- Do not auto-consume imported historical Poster/Grab orders before go-live.  
- Do not silently zero missing stock.
