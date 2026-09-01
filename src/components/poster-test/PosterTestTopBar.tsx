"use client";

import { usePathname } from "next/navigation";
import { MenuChooserLanguageFlags } from "@/components/MenuChooserLanguageFlags";
import { PosterTestProfileButton } from "@/components/poster-test/PosterTestProfileButton";
import {
  isPosterTestIntegratedHeaderPath,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";

export function PosterTestTopBar() {
  const pathname = usePathname() ?? "";

  if (pathname === POSTER_TEST_LOGIN_PATH || isPosterTestIntegratedHeaderPath(pathname)) {
    return null;
  }

  return (
    <div className="poster-test-top-bar" aria-hidden={false}>
      <MenuChooserLanguageFlags />
      <PosterTestProfileButton className="poster-test-top-bar__profile" />
    </div>
  );
}
