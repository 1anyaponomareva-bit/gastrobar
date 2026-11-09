import type { Metadata } from "next";
import { GastrofoodComingSoon } from "@/components/GastrofoodComingSoon";
import { gastrofoodMetadataIcons } from "@/lib/gastrofoodIcons";

export const metadata: Metadata = {
  title: { absolute: "GASTROFOOD" },
  description: "Меню скоро. Menu coming soon. Thực đơn sắp ra mắt.",
  robots: { index: true, follow: true },
  icons: gastrofoodMetadataIcons,
};

export default function ComingSoonPage() {
  return <GastrofoodComingSoon />;
}
