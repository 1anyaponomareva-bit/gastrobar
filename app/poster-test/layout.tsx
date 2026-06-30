import type { Metadata } from "next";
import { PosterTestBanner } from "@/components/poster-test/PosterTestBanner";

export const metadata: Metadata = {
  title: "GASTROBAR — Poster test",
  description: "Тестовая копия меню для интеграции с Poster.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PosterTestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="poster-test-shell min-h-[100dvh] bg-black">
      <PosterTestBanner />
      {children}
    </div>
  );
}
