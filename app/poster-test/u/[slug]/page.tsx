import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PosterTestUserQrClient } from "@/components/poster-test/PosterTestUserQrClient";
import { getPosterTestSessionUserId } from "@/lib/poster-test-auth/session";
import { getPosterTestUserById, getPosterTestUserByQrSlug } from "@/lib/poster-test-auth/userService";

export const metadata: Metadata = {
  title: "QR гостя — Poster test",
  robots: { index: false, follow: false },
};

export default async function PosterTestUserQrPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPosterTestUserByQrSlug(slug);
  if (!profile) notFound();

  const viewerId = await getPosterTestSessionUserId();
  const viewer = viewerId ? await getPosterTestUserById(viewerId) : null;

  return (
    <PosterTestUserQrClient
      profile={profile}
      viewer={
        viewer
          ? {
              id: viewer.id,
              name: viewer.name,
              role: viewer.role,
              bonusPoints: viewer.bonusPoints,
              qrSlug: viewer.qrSlug,
              avatar: viewer.avatar,
              provider: viewer.provider,
            }
          : null
      }
    />
  );
}
