"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";

export function PosterTestProfileButton() {
  const pathname = usePathname();
  const { user } = usePosterTestAuth();

  if (pathname === POSTER_TEST_LOGIN_PATH) {
    return null;
  }

  const href = user ? POSTER_TEST_ACCOUNT_PATH : POSTER_TEST_LOGIN_PATH;
  const label = user ? `Личный кабинет: ${user.name}` : "Войти в личный кабинет";

  return (
    <Link
      href={href}
      className="poster-test-profile-btn"
      aria-label={label}
      title={label}
    >
      {user?.avatar ? (
        <img src={user.avatar} alt="" className="poster-test-profile-btn__avatar" />
      ) : (
        <span className="poster-test-profile-btn__icon" aria-hidden="true">
          👤
        </span>
      )}
    </Link>
  );
}
