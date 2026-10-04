import type { Metadata, Viewport } from "next";
import { StaffToolBodyLayout } from "@/components/staff/StaffToolBodyLayout";

export const viewport: Viewport = {
  themeColor: "#f6f4f0",
};

export const metadata: Metadata = {
  title: "Kitchen checklist — GASTROFOOD",
  description: "Kitchen preparation checklist for GastroFood staff.",
  applicationName: "Kitchen",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kitchen",
  },
};

export default function KitchenLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StaffToolBodyLayout>{children}</StaffToolBodyLayout>;
}
