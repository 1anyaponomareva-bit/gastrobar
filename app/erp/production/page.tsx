import { erpRedirect } from "@/lib/erp/erpRedirect";
import { PROCESSING_LIST_PATH } from "@/lib/erp/processing";

export default async function ErpProductionRedirect() {
  await erpRedirect(PROCESSING_LIST_PATH);
}
