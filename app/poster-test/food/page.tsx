import type { Metadata } from "next";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import { PosterTestFoodFrame } from "@/components/poster-test/PosterTestFoodFrame";

export const metadata: Metadata = {
  title: "GASTROFOOD — Menu (test)",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PosterTestFoodPage() {
  return (
    <>
      <PosterTestFoodFrame />
      <PosterTestBottomNav />
    </>
  );
}
