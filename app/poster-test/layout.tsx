import type { Metadata } from "next";
import { PosterTestAuthProvider } from "@/components/poster-test/PosterTestAuthProvider";
import { PosterTestCartProvider } from "@/components/poster-test/PosterTestCartProvider";
import { PosterTestProfileButton } from "@/components/poster-test/PosterTestProfileButton";
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
  return (
    <div className="poster-test-shell min-h-[100dvh] bg-black">
      <PosterTestAuthProvider>
        <PosterTestProfileButton />
        <PosterTestCartProvider>{children}</PosterTestCartProvider>
      </PosterTestAuthProvider>
    </div>
  );
}
