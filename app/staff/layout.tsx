import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#12121a",
};

export const metadata: Metadata = {
  title: "Inventory — GASTROBAR",
  description:
    "Internal staff app: track stock and purchase orders for GastroFood and GastroBar.",
  applicationName: "Staff",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Staff",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
