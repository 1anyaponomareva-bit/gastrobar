import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpWorkshopsRedirect() {
  await erpRedirect("/erp/menu/locations");
}
