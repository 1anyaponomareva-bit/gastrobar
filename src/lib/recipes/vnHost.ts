import { headers } from "next/headers";
import { hostnameOf, isLegacyPublicHost } from "@/lib/erp/hostGate";

/** gastrotruck.org keeps the old recipes UI; gastrofood.vn, localhost and previews get the Orders look. */
export async function isGastrofoodRecipesHost(): Promise<boolean> {
  const host = hostnameOf((await headers()).get("host") ?? "");
  return !isLegacyPublicHost(host);
}
