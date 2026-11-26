# Phase 9B — Sales import contracts (stubs)

**Status:** contracts + validate-only stub RPC.  
**No** automatic historical import. **No** production apply without separate OK.

## Poster (operational source)

```ts
type PosterImportRow = {
  external_id: string;              // Poster order id
  account_or_location_key: string;  // spot / account
  order_at: string;                 // ISO timestamptz
  channel_code?: string;
  lines: Array<{
    sku_or_dish_code?: string;
    quantity: number;
    gross_sales?: number;
    modifiers?: unknown[];
    prep_product_codes?: string[];
  }>;
  raw?: unknown;                    // preserve original payload
};
```

Canonical key: `poster:{account_or_location_key}:{external_id}`

## GrabMerchant (aggregator financials)

```ts
type GrabImportRow = {
  external_id: string;              // Grab order id
  account_or_location_key: string;  // merchant id
  order_at?: string;
  gross_sales?: number;
  merchant_funded_discount?: number;
  platform_funded_discount?: number;
  commission?: number;
  advertising?: number;
  chargebacks?: number;
  net_earnings?: number;
  payout_ref?: string;
  raw?: unknown;
};
```

Canonical key: `grab:{account_or_location_key}:{external_id}`

## Rules

1. Poster owns dish composition / modifiers when both exist.  
2. Grab owns aggregator money fields when both exist — **do not** overwrite Poster gross with Grab gross automatically; set reconciliation `conflict` if they diverge.  
3. Different Poster ID and Grab ID are **not** auto-merged by amount/time.  
4. Match kinds: `exact` | `manual` | `unmatched` | `conflict`.  
5. Stub RPC: `erp_sales_import_stub_validate` → batch status `validated` only.

## October 2026 Grab fixture

Use arithmetic control example from `RELEASE3_FINANCIAL_ARCHITECTURE.md` §10 as **test fixture only** — never auto-create real Oct 2026 documents.
