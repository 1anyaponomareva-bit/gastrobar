import type { Metadata } from "next";
import { GastrofoodComingSoon } from "@/components/GastrofoodComingSoon";

export const metadata: Metadata = {
  title: { absolute: "GASTROFOOD" },
  description: "Меню скоро. Menu coming soon. Thực đơn sắp ra mắt.",
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/gastrofood/favicon-32.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/gastrofood/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function ComingSoonPage() {
  return <GastrofoodComingSoon />;
}
