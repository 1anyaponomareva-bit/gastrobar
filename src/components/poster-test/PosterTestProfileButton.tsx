"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";
import { useTranslation } from "@/lib/useTranslation";

const PROFILE_BUTTON_DARK =
  "pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-md transition hover:bg-white/20";

const PROFILE_BUTTON_LIGHT =
  "pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-black/[0.03] text-[#333] transition hover:bg-black/[0.06]";

export function PosterTestProfileButton({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const { user } = usePosterTestAuth();
  const { t } = useTranslation();
  const href = user ? POSTER_TEST_ACCOUNT_PATH : POSTER_TEST_LOGIN_PATH;
  const label = user
    ? t("poster_test_profile_bonuses").replace("{name}", user.name)
    : t("poster_test_profile_login");

  return (
    <Link
      href={href}
      className={cn(tone === "light" ? PROFILE_BUTTON_LIGHT : PROFILE_BUTTON_DARK, className)}
      aria-label={label}
      title={label}
    >
      {user?.avatar ? (
        <img
          src={user.avatar}
          alt=""
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className="text-[1.05rem] leading-none" aria-hidden="true">
          👤
        </span>
      )}
    </Link>
  );
}
