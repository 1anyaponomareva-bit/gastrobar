import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#12121a",
};

export const metadata: Metadata = {
  title: "Shift Checklist — GASTROBAR",
  description:
    "Opening and closing shift checklist for GastroFood and GastroBar staff.",
  applicationName: "Check",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Check",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function CheckLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
