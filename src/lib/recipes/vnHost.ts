import { headers } from "next/headers";
import { hostnameOf, isLegacyPublicHost } from "@/lib/erp/hostGate";

export const GASTROFOOD_RECIPES_HEADER = "x-gastrofood-recipes";

/** gastrotruck.org keeps the old recipes UI; gastrofood.vn, localhost and previews get the Orders look. */
export async function isGastrofoodRecipesHost(): Promise<boolean> {
  const h = await headers();
  if (h.get(GASTROFOOD_RECIPES_HEADER) === "1") return true;
  const host = hostnameOf(h.get("x-forwarded-host") || h.get("host") || "");
  return !isLegacyPublicHost(host);
}
