import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ErpShell } from "@/components/erp/ErpShell";

export const metadata: Metadata = {
  title: "GASTROFOOD ERP",
  robots: { index: false, follow: false },
};

/**
 * Singapore, next to Supabase ap-southeast-1. Staff and mini-apps keep the
 * project default (iad1). HTML itself is a static shell; this applies when a
 * nested page is dynamic (searchParams).
 */
export const preferredRegion = "sin1";

export default function ErpLayout({ children }: { children: ReactNode }) {
  return <ErpShell>{children}</ErpShell>;
}
