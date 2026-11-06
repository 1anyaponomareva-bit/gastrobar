import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpPrepsRedirect() {
  await erpRedirect("/erp/menu/preps");
}
