import type { Metadata } from "next";
import { PosterTestMerchantApp } from "@/components/poster-test/merchant/PosterTestMerchantApp";

export const metadata: Metadata = {
  title: "GASTROBAR — Заказы",
  description: "Панель заказов для персонала GASTROBAR.",
  robots: {
    index: false,
    follow: false,
  },
  manifest: "/poster-test-merchant-manifest.json",
  appleWebApp: {
    capable: true,
    title: "GASTROBAR Orders",
    statusBarStyle: "black-translucent",
  },
};

export default function PosterTestMerchantPage() {
  return <PosterTestMerchantApp />;
}
