import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ErpShell } from "@/components/erp/ErpShell";

export const metadata: Metadata = {
  title: "GASTROFOOD ERP",
  robots: { index: false, follow: false },
};

export default function ErpLayout({ children }: { children: ReactNode }) {
  return <ErpShell>{children}</ErpShell>;
}
