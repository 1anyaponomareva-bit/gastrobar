import type { Metadata } from "next";
import { PosterTestBarClient } from "@/components/poster-test/PosterTestBarClient";
import { getPosterMenuForVenue } from "@/lib/poster/menuService";
import type { MenuItem } from "@/data/menu";

export const metadata: Metadata = {
  title: "GASTROBAR — Bar menu (test)",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function PosterTestBarPage() {
  const menu = await getPosterMenuForVenue("bar");

  return (
    <PosterTestBarClient
      items={(menu.items as MenuItem[]) ?? []}
      loadError={menu.success ? null : menu.errorText ?? menu.error ?? "Unknown error"}
    />
  );
}
