import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNamedErpHost, productionErpHostEnv, readErpHostGateConfig, hostnameOf } from "@/lib/erp/hostGate";
import { toPublicErpHref } from "@/lib/erp/publicPath";

/** Host-aware redirect so gastrofood.vn never sends the browser to `/erp/...`. */
export async function erpRedirect(internalHref: string): Promise<never> {
  const host = hostnameOf((await headers()).get("host") ?? "");
  const strip = isNamedErpHost(
    host,
    readErpHostGateConfig(
      productionErpHostEnv({
        ERP_HOSTS: process.env.ERP_HOSTS,
        ERP_REDIRECT_FROM_LEGACY: process.env.ERP_REDIRECT_FROM_LEGACY,
        ERP_CLOSE_LEGACY_API: process.env.ERP_CLOSE_LEGACY_API,
      }),
    ),
  );
  redirect(strip ? toPublicErpHref(internalHref) : internalHref);
}
