"use client";

import Link from "next/link";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { PosterTestBeerClubCard } from "@/components/poster-test/PosterTestBeerClubCard";
import type { PosterTestUser } from "@/lib/poster-test-auth/types";
import { POSTER_TEST_ROOT } from "@/lib/posterTestRoutes";

function roleLabel(role: PosterTestUser["role"]): string {
  if (role === "admin") return "Администратор";
  if (role === "staff") return "Персонал";
  return "Гость";
}

export function PosterTestAccountClient({ user }: { user: PosterTestUser }) {
  const { signOut } = usePosterTestAuth();

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6 text-white">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Личный кабинет</p>
          <h1 className="text-2xl font-semibold">{user.name}</h1>
        </div>
        <Link
          href={POSTER_TEST_ROOT}
          className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
        >
          Меню
        </Link>
      </div>

      <section className="poster-test-account-bonuses" aria-labelledby="poster-test-bonuses-title">
        <h2 id="poster-test-bonuses-title" className="poster-test-account-bonuses__title">
          <span aria-hidden="true">🎁</span> Мои бонусы
        </h2>
        <div className="poster-test-account-bonuses__card">
          <PosterTestBeerClubCard variant="full" />
        </div>
      </section>

      <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
        <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-white/45">Профиль</h2>
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt=""
              className="h-16 w-16 rounded-full border border-white/15 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl">
              👤
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-white/55">{user.email ?? "—"}</p>
          </div>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
            <dt className="text-white/45">Имя</dt>
            <dd className="text-right text-white/90">{user.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Email</dt>
            <dd className="text-right text-white/90">{user.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Роль</dt>
            <dd className="text-right text-white/90">{roleLabel(user.role)}</dd>
          </div>
        </dl>
      </section>

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-4 w-full rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:border-white/30 hover:bg-white/[0.04]"
      >
        Выйти
      </button>
    </div>
  );
}
