import { redirect } from "next/navigation";

/** ERP screens always live under `/erp`, on gastrofood.vn and gastrotruck.org. */
export async function erpRedirect(internalHref: string): Promise<never> {
  redirect(internalHref);
}
