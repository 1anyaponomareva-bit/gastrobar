import type { Metadata } from "next";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import { PosterTestFoodMenu } from "@/components/poster-test/PosterTestFoodMenu";

export const metadata: Metadata = {
  title: "GASTROFOOD — Menu (test)",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PosterTestFoodPage() {
  return (
    <div className="poster-test-food-light">
      <PosterTestFoodMenu />
      <PosterTestBottomNav />
    </div>
  );
}
