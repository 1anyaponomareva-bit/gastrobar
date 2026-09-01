"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";

const PROFILE_BUTTON_CLASS =
  "pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-md transition hover:bg-white/20";

export function PosterTestProfileButton({ className }: { className?: string }) {
  const { user } = usePosterTestAuth();
  const href = user ? POSTER_TEST_ACCOUNT_PATH : POSTER_TEST_LOGIN_PATH;
  const label = user ? `Бонусы: ${user.name}` : "Войти для бонусов";

  return (
    <Link
      href={href}
      className={cn(PROFILE_BUTTON_CLASS, className)}
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
