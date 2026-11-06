# Order list (new ERP app) — screens and interactions

Agent 2 implements UI. Agent 3 persists drafts/snapshots. Agent 1 owns PDF (`src/lib/orders/orderPdf.ts`). Old `/staff` Order List + Prep Stock stay as they are.

Catalog: **ERP products, packs, suppliers only**. Do not import, copy, or fetch `staffCatalog` / `staffOrderItems` / JSON catalogs.

---

## What this app is

Phone-first list: pick a warehouse → pick a supplier → type qty/packs for that supplier’s products → download or share a PDF → mark **«Заказал у поставщика»**.

Flow copied from old Staff **Order list** (`/staff`, section “Order list”):

1. Supplier tabs (plus **All**).
2. Products of that supplier, grouped by category.
3. Qty field with pack hint.
4. PDF only on a **supplier** tab (not on All).

---

## Prep Stock — omit entirely

Old `/staff` has a second section **Prep stock**. **Do not build it** in the new orders app. Those products may still appear on the order list if they are ERP goods with a supplier — only the Prep Stock *feature* is out.

Do **not** transfer:

| Old Staff Prep Stock | Why omit |
| --- | --- |
| Section picker “Order list / Prep stock” | This app is orders only |
| In-house / warehouse count fields (`restaurant`, `warehouse`) | Prep counting, not purchasing |
| Zalo paste (“Склад: вставить сообщение из Zalo”) | Warehouse stock message parser |
| Thresholds `prepOrderAtOrBelow` / `warehouseOrderAtOrBelow` | Prep alerts |
| Tasks **PREP ORDER** / **FOOD ORDER** (red rows) | Prep PDF logic |
| Prep Stock PDF (`PrepStock_…pdf`, in-house / warehouse / task columns) | Separate document |
| `staffInStockItems` / `evaluateStaffStock` / `staffStockParser` | Hardcoded prep list |
| “New day” clearing **stock** values | Orders have their own draft lifecycle |
| Employee name as a required PDF field | Snapshot uses warehouse + order no + revision |

Do **not** put semi-finished **production** (make a batch / write off ingredients) on this screen. That stays `/erp/preps`.

---

## Data (ERP, not Staff JSON)

Load from ERP state already used by stock pages:

- `suppliers` (`erp_suppliers`) — active, not archived; `name`, optional `zalo_url`
- `products` (`erp_products`) — not archived
- `packs` (`erp_packs`) + `productPacks` (`erp_product_packs`)
- `warehouses` — for the warehouse picker
- `categories` — grouping chips

**A product belongs to a supplier** when a live `productPack` has that `supplier_id`. If a product has no pack-supplier, fall back to `product.staff_supplier_id` (ERP column, not the JSON file).

**Show on the list:** ingredients, packaging, consumables, finished goods that have a supplier. **Hide:** archived rows; products with no supplier at all. Semi-finished (`type === "semi_finished"`) stay off this list unless they have a real supplier pack (unusual — still follow packs if present).

**Do not** use `DEFAULT_STAFF_CATALOG` or `/api/staff-catalog`.

Pack line on the card and in the snapshot:

- `packLabel` = `productPack.label` or catalog pack `name` (e.g. `box 10*1040 g`)
- `unit` = pack / order unit as shown on the input suffix (`box`, `kg`, `pcs`, …). Bilingual suffix is OK (`box / thùng`) if you already have unit words
- `qty` = number typed in that unit
- `nameEn` / `nameVn` / `brand` = product fields (empty string if missing)

---

## Shared snapshot DTO (agent 1 PDF + agent 3 storage)

Exact shape. Agent 3 stores a snapshot matching these fields. Agent 2 builds it, then calls the PDF module. Do not add Staff `itemNo` to this DTO (old PDF had ITEM #; new PDF does not).

```ts
import type { OrderPdfInput } from "@/lib/orders/orderPdf";

// OrderPdfInput: {
//   orderNo: string;
//   revision: number;
//   orderedAt: string;          // ISO date or datetime; PDF prints the date
//   supplierName: string;
//   warehouseName?: string;
//   comment?: string;
//   lines: Array<{
//     nameEn: string;
//     nameVn: string;
//     brand: string;
//     packLabel: string;
//     unit: string;
//     qty: number;
//   }>;
// }
```

Only lines with `qty > 0` go into the snapshot / PDF.

---

## Screens

Recommended route (agent 2 creates pages; agent 4 opens host/middleware): **`/erp/orders`**. Phone layout, max width ~760px like Staff. ERP chrome (`ErpShell`, `T()`) — RU / EN / VN.

### 0. Shell

- Warehouse select (required). Default: location default warehouse, else first active.
- Optional comment (one line, supplier draft).
- Live **order no** + **revision** once agent 3 has a draft (`ORD-…` · `rev 2`). Unsaved: “Черновик / Draft”.
- In-app browser banner if UA is Zalo/Facebook/etc. (reuse `detectInAppBrowser` from `@/lib/deliverPdfFile`): Share PDF does not work inside Zalo — tell the user to open Safari/Chrome. **Do not auto-open Zalo.**

No Gastrofood/Gastrobar venue toggle. No employee field. No Prep Stock tab.

### 1. All products (`tab = all`)

Horizontal supplier chips:

- **All** first
- Then each supplier with at least one listable product, ERP `sort` then name
- Badge = count of products with qty > 0 for that supplier (gold when > 0, same as old `.hasMarked`)

Search: name EN/VN, brand, supplier, product code. Reset next to search.

**All tab only:** category chips (ERP categories that have visible products + All). Supplier tab skips category chips (old Staff did this).

Hint: *Enter quantities here. Share the PDF from the supplier tab.*  
`Отметьте количество к заказу. PDF — во вкладке поставщика.`

Cards grouped by category:

- Title: `nameEn / nameVn` (omit duplicate VN)
- Sub: `brand · supplier` (supplier on All tab only)
- One qty input (`inputMode="decimal"`, comma or dot) + unit suffix
- Pack hint under the field (`packLabel`)
- Qty > 0 → gold border (old `.orderCard.marked`)

**No PDF button on All.**

### 2. One supplier

Same cards, no supplier name on the card. Mode line: `{supplier} · {marked} of {count}`.

Sticky/footer actions (only this tab):

1. **Share / Download PDF** — gold, full width (old “Share PDF”)
2. **«Заказал у поставщика»** — agent 2 UI + agent 3 persist (see below)
3. Optional, separate from PDF: a Zalo link if `supplier.zalo_url` exists. Must **not** open on share. Prefer omitting it in v1; the share sheet is how the cook sends the file (they can pick Zalo themselves).

### 3. Empty / error

- No products: “Nothing found. Tap Reset.”
- PDF with zero lines: generator still builds a one-page empty PDF (agent 1). Prefer disabling Share until marked > 0.
- Save/share errors: alert, stay on screen.

---

## Draft

One **open draft per (warehouse, supplier)**. Agent 3 is source of truth. Agent 2 may keep local qty while typing and debounce-save.

| Event | Agent 2 | Agent 3 |
| --- | --- | --- |
| Type qty | Update card; debounce save | Upsert draft lines |
| First save / first PDF | Wait for `orderNo` + `revision` | Allocate `orderNo`, `revision = 1`, freeze snapshot fields |
| Change lines/comment/warehouse after a PDF or after «Заказал» | Treat PDF cache as dead; show “new revision” | Increment **revision**, store new snapshot |
| Reset | Confirm, then clear qty in scope | Clear those draft lines (same warehouse; current supplier or all) |
| Switch supplier tab | Keep other suppliers’ qty | Independent drafts |

Reset copy:

- All tab: “Clear all entered order quantities?”
- Supplier tab: “Clear entered quantities for {supplier}?”

Do **not** use Staff `localStorage` keys `gf_*`.

**Revision rule (PDF invalidation):** `revision` is part of the snapshot and of the PDF filename (`…_r{n}_…`) and of PDF metadata (`Subject: revision=n`). After a bump, never share a blob built for an older revision. Cache key: `orderPdfCacheKey(input)` from agent 1.

---

## PDF share / download

Module: `src/lib/orders/orderPdf.ts`.

```ts
import {
  makeOrderPdfBlob,
  getOrderPdfFileName,
  orderPdfCacheKey,
  preloadOrderPdfFonts,
} from "@/lib/orders/orderPdf";
import { deliverPdfFile, detectInAppBrowser } from "@/lib/deliverPdfFile";
```

1. `preloadOrderPdfFonts()` on screen mount.
2. Persist draft (agent 3) so `orderNo` / `revision` / `orderedAt` are real.
3. Build `OrderPdfInput` from that snapshot (names/brand/pack from ERP as stored, not live-edited catalog after the fact).
4. If `orderPdfCacheKey(input)` matches a prepared blob, reuse it; else `makeOrderPdfBlob(input)`.
5. If in-app browser → alert, **do not** share.
6. `deliverPdfFile(blob, getOrderPdfFileName(input))`:
   - phone/tablet → Web Share with a **file** (no title/url, same as Staff)
   - desktop → download
7. **No auto-Zalo.** Do not `window.open(zaloUrl)` on success.

PDF content (agent 1): supplier; order no; date; revision; warehouse; comment; EN/VN names; brand; qty + unit; pack label; Gastrofood footer (address + phone). Long names wrap; Vietnamese via Noto Sans; rows do not split across pages; table header repeats; page `n / m`.

---

## Button «Заказал у поставщика» (agent 2 + 3)

Not a PDF action. Means: this snapshot was sent/agreed with the supplier.

**Enable** when: supplier tab, `marked > 0`, draft saved (`orderNo` present), not already ordered **at this revision**.

**Click:**

1. Confirm: “Отметить заказ {orderNo} (rev {n}) для {supplier} как отправленный поставщику?”
2. Agent 3: set status `ordered`, keep the **current** snapshot (same `revision`). Do not bump revision on this click alone.
3. Agent 2: show “Заказано · {orderNo} · rev {n} · {time}”. Qty can stay visible.
4. If the cook then changes qty/comment: agent 3 opens the **next revision**; UI: “Предыдущий PDF (rev n) недействителен. Текущая версия: n+1.” Share uses the new snapshot. «Заказал» is available again for the new revision.

Agent 3 does **not** post a receipt from this button (receiving goods is `/erp/documents` later). This is order-list status + snapshot only.

---

## Copy (minimum)

| RU | EN | VN |
| --- | --- | --- |
| Заказы | Orders | Đơn hàng |
| Все | All | Tất cả |
| Поиск по названию, бренду, поставщику | Search name, brand, supplier | Tìm tên, thương hiệu, NCC |
| Сброс | Reset | Xóa |
| Заказ | Order | Đặt hàng |
| Скачать / поделиться PDF | Share PDF | Gửi PDF |
| Заказал у поставщика | Ordered from supplier | Đã đặt nhà cung cấp |
| Черновик | Draft | Nháp |

---

## Out of scope for agent 2

- `app/orders` vs `app/erp/orders` host/middleware/next.config (agent 4)
- SQL / tables (agent 3)
- PDF drawing (agent 1)
- Changing Staff files (`StaffOrderList.tsx`, `staffInventoryPdf.ts`, …)

## Agent 1 API (for wiring)

Import from `@/lib/orders/orderPdf` (types also live in `orderPdfTypes.ts` if you need them without `pdf-lib`).

| Export | Role |
| --- | --- |
| `OrderPdfInput` / `OrderPdfLine` | Snapshot DTO |
| `makeOrderPdfBlob(input)` | `Promise<Blob>` (Noto Sans, Vietnamese, page breaks) |
| `getOrderPdfFileName(input)` | `Order_{supplier}_{orderNo}_r{revision}_{date}.pdf` |
| `orderPdfCacheKey(input)` | JSON identity; drop cached blob when this changes |
| `preloadOrderPdfFonts()` | Call on mount (browser fetch of `/fonts/NotoSans-*.ttf`) |
| `setOrderPdfFonts(fonts)` | Node/tests only — inject font bytes |
| `formatOrderLineName(line)` | `EN / VN` for cards if useful |
| `deliverPdfFile` | Existing helper in `@/lib/deliverPdfFile`, not Staff catalog |

Samples (generated by `npx tsx scripts/orders/sample-pdf.ts`):

- `docs/orders/samples/order-mm-short.pdf` — 1 page, few lines
- `docs/orders/samples/order-long-vn.pdf` — long EN/VN names, several pages
