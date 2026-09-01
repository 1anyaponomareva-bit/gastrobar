"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuChooserLanguageFlags } from "@/components/MenuChooserLanguageFlags";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";

export function PosterTestTopBar() {
  const pathname = usePathname();
  const { user } = usePosterTestAuth();

  if (pathname === POSTER_TEST_LOGIN_PATH) {
    return null;
  }

  const href = user ? POSTER_TEST_ACCOUNT_PATH : POSTER_TEST_LOGIN_PATH;
  const label = user ? `Бонусы: ${user.name}` : "Войти для бонусов";

  return (
    <div className="poster-test-top-bar" aria-hidden={false}>
      <MenuChooserLanguageFlags />
      <Link
        href={href}
        className="poster-test-top-bar__profile"
        aria-label={label}
        title={label}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="poster-test-top-bar__avatar" />
        ) : (
          <span className="poster-test-top-bar__icon" aria-hidden="true">
            👤
          </span>
        )}
      </Link>
    </div>
  );
}
