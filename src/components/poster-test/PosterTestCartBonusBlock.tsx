"use client";

import Link from "next/link";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { PosterTestBeerClubCard } from "@/components/poster-test/PosterTestBeerClubCard";
import {
  POSTER_TEST_ACCOUNT_PATH,
  POSTER_TEST_LOGIN_PATH,
} from "@/lib/posterTestRoutes";

export function PosterTestCartBonusBlock() {
  const { user, loading } = usePosterTestAuth();

  if (loading) {
    return (
      <div className="poster-test-cart-bonus poster-test-cart-bonus--loading" aria-hidden="true">
        <div className="poster-test-cart-bonus__skeleton" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="poster-test-cart-bonus" aria-label="Бонусная программа">
        <p className="poster-test-cart-bonus__title">
          <span aria-hidden="true">🎁</span> Войдите, чтобы копить бонусы
        </p>
        <p className="poster-test-cart-bonus__text">Каждое 7-е пиво — за наш счёт</p>
        <Link href={POSTER_TEST_LOGIN_PATH} className="poster-test-cart-bonus__cta">
          Войти
        </Link>
      </section>
    );
  }

  return (
    <section className="poster-test-cart-bonus poster-test-cart-bonus--auth" aria-label="Бонусы">
      <div className="poster-test-cart-bonus__user">
        {user.avatar ? (
          <img src={user.avatar} alt="" className="poster-test-cart-bonus__avatar" />
        ) : (
          <span className="poster-test-cart-bonus__avatar poster-test-cart-bonus__avatar--placeholder" aria-hidden="true">
            👤
          </span>
        )}
        <span className="poster-test-cart-bonus__name">{user.name}</span>
      </div>
      <PosterTestBeerClubCard variant="inline" showTitle={false} />
      <Link href={POSTER_TEST_ACCOUNT_PATH} className="poster-test-cart-bonus__cta poster-test-cart-bonus__cta--secondary">
        Мои бонусы
      </Link>
    </section>
  );
}
