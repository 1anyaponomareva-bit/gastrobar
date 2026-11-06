import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpCatalogRedirect() {
  await erpRedirect("/erp/products");
}
