import type { Metadata, Viewport } from "next";
import { StaffToolBodyLayout } from "@/components/staff/StaffToolBodyLayout";
import { isGastrofoodRecipesHost } from "@/lib/recipes/vnHost";

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

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: (await isGastrofoodRecipesHost()) ? "#1d1d1b" : "#12121a" };
}

export default function RecipesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StaffToolBodyLayout>{children}</StaffToolBodyLayout>;
}
