import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpDocumentsRedirect() {
  await erpRedirect("/erp/stock");
}
