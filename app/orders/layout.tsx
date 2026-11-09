import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { StaffToolBodyLayout } from "@/components/staff/StaffToolBodyLayout";
import { OrdersShell } from "@/components/orders/OrdersShell";
import { gastrofoodMetadataIcons } from "@/lib/gastrofoodIcons";

export const viewport: Viewport = {
  themeColor: "#1d1d1b",
};

export const metadata: Metadata = {
  title: "Order List — GASTROFOOD",
  description: "Supplier orders for GASTROFOOD staff",
  applicationName: "GASTROFOOD Orders",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Orders",
  },
  icons: gastrofoodMetadataIcons,
};

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <StaffToolBodyLayout>
      <OrdersShell>{children}</OrdersShell>
    </StaffToolBodyLayout>
  );
}
