import type { Metadata } from "next";
import { PosterTestAccountClient } from "@/components/poster-test/PosterTestAccountClient";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";

export const metadata: Metadata = {
  title: "Личный кабинет — Poster test",
  robots: { index: false, follow: false },
};

export default function PosterTestAccountPage() {
  return (
    <>
      <PosterTestAccountClient />
      <PosterTestBottomNav />
    </>
  );
}
