import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpSettingsRedirect() {
  await erpRedirect("/erp/service");
}
