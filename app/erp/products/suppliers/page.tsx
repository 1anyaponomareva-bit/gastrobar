import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpProductSuppliersRedirect() {
  await erpRedirect("/erp/stock/suppliers");
}
