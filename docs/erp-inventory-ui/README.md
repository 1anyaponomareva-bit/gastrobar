# Isolated inventory UI scenario

PGlite + Playwright headless Chrome. Not production. No post on gastrotruck.org.

- Full count: milk 9, sugar 8; idle oil stayed 3.
- Partial count: sugar 9; milk 9; oil 3.
- Concurrent POST of one count: one consume, stock 7.
- Receipt form pack math (local, same layout as prod): 3 × 1.284 kg at 128400₫ → 3,852 кг, 385 200₫, 100 000₫/кг. Not saved.

Inventory:

- `docs/erp-inventory-ui/full-form.png`
- `docs/erp-inventory-ui/full-fact.png`
- `docs/erp-inventory-ui/full-list.png`
- `docs/erp-inventory-ui/full-reopen.png`
- `docs/erp-inventory-ui/full-posted.png`
- `docs/erp-inventory-ui/partial-form.png`
- `docs/erp-inventory-ui/partial-fact.png`
- `docs/erp-inventory-ui/partial-list.png`
- `docs/erp-inventory-ui/partial-reopen.png`
- `docs/erp-inventory-ui/partial-posted.png`

Receipt pack display (local, because prod has no 1.284 pack):

- `docs/erp-inventory-ui/receipt-pack-1284.png`

Prod evidence that `1.284` is absent from `erp_packs` (REST find 0/0):

- `docs/erp-inventory-ui/prod-no-1284-pack.webp`
