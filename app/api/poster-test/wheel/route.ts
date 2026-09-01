import { NextResponse } from "next/server";
import { requirePosterTestUser } from "@/lib/poster-test-auth/api";
import {
  executePosterTestWheelSpin,
  getPosterTestWheelStatus,
  resetPosterTestWheel,
} from "@/lib/poster-test-auth/wheelService";
import { isPosterTestWheelTestMode } from "@/lib/poster-test-auth/wheelTestMode";
import type { SpinOutcome } from "@/lib/wheel";
import type { Bonus } from "@/services/bonusService";

export const runtime = "nodejs";

function serializeBonus(bonus: Bonus | null) {
  if (!bonus) return null;
  return {
    id: bonus.id,
    type: bonus.type,
    title: bonus.title,
    productId: bonus.productId,
    navBarCategory: bonus.navBarCategory ?? null,
    description: bonus.description ?? null,
    createdAt: bonus.createdAt,
    expiresAt: bonus.expiresAt,
    redeemed: bonus.redeemed,
  };
}

function serializeOutcome(outcome: SpinOutcome) {
  return {
    segmentIndex: outcome.segmentIndex,
    segmentId: outcome.segmentId,
    bonusType: outcome.bonusType,
    isLoss: outcome.isLoss,
    isFirstWheel: outcome.isFirstWheel,
  };
}

export async function GET() {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth.errorResponse;

  const status = await getPosterTestWheelStatus(auth.user.id);
  if (!status) {
    return NextResponse.json(
      { success: false, message: "Could not load wheel status." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    canSpin: status.canSpin,
    msUntilNextSpin: status.msUntilNextSpin,
    activeBonus: serializeBonus(status.activeBonus),
    testMode: isPosterTestWheelTestMode(auth.user.email),
  });
}

export async function POST() {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth.errorResponse;

  const result = await executePosterTestWheelSpin(auth.user.id);

  if (!result.ok) {
    if (result.code === "cooldown") {
      return NextResponse.json(
        {
          success: false,
          error: "COOLDOWN",
          msUntilNextSpin: result.msUntilNextSpin,
          message: "Wheel spin is on cooldown.",
          testMode: isPosterTestWheelTestMode(auth.user.email),
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Could not execute wheel spin." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    outcome: serializeOutcome(result.outcome),
    bonus: serializeBonus(result.bonus),
    msUntilNextSpin: result.msUntilNextSpin,
    canSpin: false,
    testMode: isPosterTestWheelTestMode(auth.user.email),
  });
}

export async function DELETE() {
  const auth = await requirePosterTestUser();
  if (auth.errorResponse) return auth.errorResponse;

  if (!isPosterTestWheelTestMode(auth.user.email)) {
    return NextResponse.json(
      { success: false, message: "Wheel test mode is disabled." },
      { status: 403 },
    );
  }

  const ok = await resetPosterTestWheel(auth.user.id);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Could not reset wheel state." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    canSpin: true,
    msUntilNextSpin: 0,
    activeBonus: null,
    testMode: true,
  });
}
