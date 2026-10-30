import type { Metadata, Viewport } from "next";
import { StaffToolBodyLayout } from "@/components/staff/StaffToolBodyLayout";

export const viewport: Viewport = {
  themeColor: "#12121a",
};

export const metadata: Metadata = {
  title: "Recipes — GASTROFOOD",
  description: "Internal staff app: tech cards and recipes for GastroFood.",
  applicationName: "Recipes",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Recipes",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RecipesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StaffToolBodyLayout>{children}</StaffToolBodyLayout>;
}
