import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PosterTestAccountClient } from "@/components/poster-test/PosterTestAccountClient";
import { PosterTestBottomNav } from "@/components/poster-test/PosterTestBottomNav";
import { getPosterTestSessionUserId } from "@/lib/poster-test-auth/session";
import { getPosterTestUserById } from "@/lib/poster-test-auth/userService";
import { POSTER_TEST_LOGIN_PATH } from "@/lib/posterTestRoutes";

export const metadata: Metadata = {
  title: "Личный кабинет — Poster test",
  robots: { index: false, follow: false },
};

export default async function PosterTestAccountPage() {
  const userId = await getPosterTestSessionUserId();
  if (!userId) {
    redirect(POSTER_TEST_LOGIN_PATH);
  }

  const user = await getPosterTestUserById(userId);
  if (!user) {
    redirect(POSTER_TEST_LOGIN_PATH);
  }

  return (
    <>
      <PosterTestAccountClient user={user} />
      <PosterTestBottomNav />
    </>
  );
}
