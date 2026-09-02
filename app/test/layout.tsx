import type { Metadata, Viewport } from "next";
import { StaffToolBodyLayout } from "@/components/staff/StaffToolBodyLayout";

export const viewport: Viewport = {
  themeColor: "#12121a",
};

export const metadata: Metadata = {
  title: "Staff Test — GASTROFOOD",
  description:
    "Employee knowledge test for GastroFood: orders, storage, cooking, and packaging.",
  applicationName: "Staff Test",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Staff Test",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function StaffTestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StaffToolBodyLayout>{children}</StaffToolBodyLayout>;
}
