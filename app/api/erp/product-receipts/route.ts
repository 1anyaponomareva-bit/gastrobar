import { ErpHttpError, readAsAdmin, rpc, ServerTiming } from "@/lib/erp/server";
import type { ErpProductReceipt } from "@/lib/erp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN = 20;

type Row = Omit<ErpProductReceipt, "qty" | "unit_cost" | "cost_amount"> & { qty: number | string; unit_cost: number | string | null; cost_amount: number | string | null };

const num = (value: number | string | null) => (value === null ? null : Number(value));

/** Latest posted deliveries and opening balances of one product. */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const product = new URL(request.url).searchParams.get("product") ?? "";
    if (!UUID.test(product)) throw new ErpHttpError(400, "ERP_INVALID", "product");
    const { data: rows } = await readAsAdmin(timing, () => rpc<Row[]>("erp_product_receipts", { p_product: product, p_limit: SHOWN }));
    const receipts: ErpProductReceipt[] = (rows ?? []).map((row) => ({
      ...row,
      qty: Number(row.qty),
      unit_cost: num(row.unit_cost),
      cost_amount: num(row.cost_amount),
    }));
    return timing.json({ receipts });
  } catch (error) {
    return timing.error(error);
  }
}
