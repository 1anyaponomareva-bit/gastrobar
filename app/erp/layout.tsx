import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { ErpShell } from "@/components/erp/ErpShell";
import { hostnameOf, isNamedErpHost, productionErpHostEnv, readErpHostGateConfig } from "@/lib/erp/hostGate";

export const metadata: Metadata = {
  title: "GASTROFOOD ERP",
  robots: { index: false, follow: false },
};

export default async function ErpLayout({ children }: { children: ReactNode }) {
  const host = hostnameOf((await headers()).get("host") ?? "");
  const stripPrefix = isNamedErpHost(
    host,
    readErpHostGateConfig(
      productionErpHostEnv({
        ERP_HOSTS: process.env.ERP_HOSTS,
        ERP_REDIRECT_FROM_LEGACY: process.env.ERP_REDIRECT_FROM_LEGACY,
        ERP_CLOSE_LEGACY_API: process.env.ERP_CLOSE_LEGACY_API,
      }),
    ),
  );
  return <ErpShell stripPrefix={stripPrefix}>{children}</ErpShell>;
}
