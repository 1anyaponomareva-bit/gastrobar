import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpProductionRedirect() {
  await erpRedirect("/erp/preps/batches");
}
