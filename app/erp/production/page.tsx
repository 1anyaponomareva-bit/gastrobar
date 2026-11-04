import { redirect } from "next/navigation";

export default function ErpProductionRedirect() {
  redirect("/erp/preps/batches");
}
