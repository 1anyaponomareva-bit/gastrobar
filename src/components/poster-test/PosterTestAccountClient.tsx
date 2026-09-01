"use client";

import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { PosterTestBeerClubCard } from "@/components/poster-test/PosterTestBeerClubCard";
import type { PosterTestUser } from "@/lib/poster-test-auth/types";

export function PosterTestAccountClient({ user }: { user: PosterTestUser }) {
  const { signOut } = usePosterTestAuth();

  return (
    <div className="poster-test-page-pad-top mx-auto max-w-md px-4 pb-28 pt-6 text-white">
      <section className="poster-test-account-bonuses" aria-labelledby="poster-test-bonuses-title">
        <h1 id="poster-test-bonuses-title" className="poster-test-account-bonuses__title">
          <span aria-hidden="true">🎁</span> Мои бонусы
        </h1>
        <div className="poster-test-account-bonuses__card">
          <PosterTestBeerClubCard variant="full" />
        </div>
      </section>

      <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
        <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-white/45">Профиль</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Имя</dt>
            <dd className="text-right font-medium text-white/90">{user.name}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
            <dt className="text-white/45">Email</dt>
            <dd className="text-right font-medium text-white/90">{user.email ?? "—"}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 w-full rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:border-white/30 hover:bg-white/[0.04]"
        >
          Выйти
        </button>
      </section>
    </div>
  );
}
