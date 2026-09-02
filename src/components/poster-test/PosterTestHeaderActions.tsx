"use client";

import { LanguageMenu } from "@/components/LanguageMenu";
import { PosterTestProfileButton } from "@/components/poster-test/PosterTestProfileButton";

/** Language dropdown + account icon for poster-test food/bar headers. */
export function PosterTestHeaderActions({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <div className="poster-test-header-actions flex items-center gap-2">
      <LanguageMenu tone={tone} />
      <PosterTestProfileButton tone={tone} />
    </div>
  );
}
