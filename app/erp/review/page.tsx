import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpReviewRedirect() {
  await erpRedirect("/erp/service/review");
}
