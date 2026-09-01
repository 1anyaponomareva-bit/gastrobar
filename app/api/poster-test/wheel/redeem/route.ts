import { NextResponse } from "next/server";
import { requirePosterTestUser } from "@/lib/poster-test-auth/api";
import { redeemPosterTestWheelBonus } from "@/lib/poster-test-auth/wheelService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth.errorResponse;

  let body: { bonusId?: string };
  try {
    body = (await request.json()) as { bonusId?: string };
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }

  if (!body.bonusId) {
    return NextResponse.json({ success: false, message: "bonusId required." }, { status: 400 });
  }

  const ok = await redeemPosterTestWheelBonus(auth.user.id, body.bonusId);
  if (!ok) {
    return NextResponse.json({ success: false, message: "Bonus not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
