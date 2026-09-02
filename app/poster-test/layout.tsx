import type { Metadata } from "next";
import { PosterTestShell } from "@/components/poster-test/PosterTestShell";
import "./poster-test-layout.css";

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
  return <PosterTestShell>{children}</PosterTestShell>;
}
