"use client";

import Link from "next/link";
import type { PosterTestUser } from "@/lib/poster-test-auth/types";
import { POSTER_TEST_ACCOUNT_PATH, POSTER_TEST_ROOT } from "@/lib/posterTestRoutes";

type Viewer = Pick<
  PosterTestUser,
  "id" | "name" | "role" | "bonusPoints" | "qrSlug" | "avatar" | "provider"
> | null;

export function PosterTestUserQrClient({
  profile,
  viewer,
}: {
  profile: PosterTestUser;
  viewer: Viewer;
}) {
  const isStaff = viewer?.role === "staff" || viewer?.role === "admin";
  const isOwner = viewer?.id === profile.id;

  if (!viewer) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 text-center text-white">
        <p className="text-sm text-white/60">Войдите, чтобы открыть персональную страницу.</p>
        <Link
          href={`/poster-test/login?returnTo=${encodeURIComponent(`/poster-test/u/${profile.qrSlug}`)}`}
          className="mt-4 rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black"
        >
          Войти
        </Link>
      </div>
    );
  }

  if (isStaff) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-white">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Staff mode</p>
        <h1 className="mt-2 text-2xl font-semibold">{profile.name}</h1>
        <div className="mt-6 rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-5">
          <p className="text-sm leading-6 text-white/70">
            Staff-интерфейс для работы с гостем будет добавлен на следующем этапе.
          </p>
          <dl className="mt-4 space-y-2 text-sm text-white/80">
            <div className="flex justify-between gap-3">
              <dt className="text-white/45">ID</dt>
              <dd className="truncate">{profile.id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white/45">Роль гостя</dt>
              <dd>{profile.role}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-white/45">Бонусы</dt>
              <dd>{profile.bonusPoints}</dd>
            </div>
          </dl>
        </div>
        <Link href={POSTER_TEST_ACCOUNT_PATH} className="mt-6 inline-block text-sm text-amber-200">
          Вернуться в кабинет
        </Link>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 text-center text-white">
        <p className="text-sm text-white/60">
          Это персональный QR другого гостя. Вы можете просматривать только свою страницу.
        </p>
        <Link
          href={POSTER_TEST_ACCOUNT_PATH}
          className="mt-4 rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/80"
        >
          Мой кабинет
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8 text-white">
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">Ваш QR</p>
      <h1 className="mt-2 text-2xl font-semibold">{profile.name}</h1>
      <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-center">
        <div className="flex justify-center rounded-2xl bg-white p-4">
          <img
            src={`/api/poster-test/qr?slug=${encodeURIComponent(profile.qrSlug)}`}
            alt="Персональный QR"
            className="h-48 w-48"
          />
        </div>
        <p className="mt-4 text-sm text-white/60">
          Покажите этот код сотруднику GASTROBAR для идентификации и будущих бонусов.
        </p>
      </div>
      <Link href={POSTER_TEST_ROOT} className="mt-6 inline-block text-sm text-amber-200">
        На главную
      </Link>
    </div>
  );
}
