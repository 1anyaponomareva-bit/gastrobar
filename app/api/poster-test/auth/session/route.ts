import { NextResponse } from "next/server";
import {
  requirePosterTestUser,
  serializePosterTestUser,
} from "@/lib/poster-test-auth/api";
import { getPosterTestSessionUserId } from "@/lib/poster-test-auth/session";
import { getPosterTestUserById } from "@/lib/poster-test-auth/userService";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getPosterTestSessionUserId();
  if (!userId) {
    return NextResponse.json({ success: true, user: null });
  }

  const user = await getPosterTestUserById(userId);
  if (!user) {
    return NextResponse.json({ success: true, user: null });
  }

  return NextResponse.json({
    success: true,
    user: serializePosterTestUser(user),
  });
}
