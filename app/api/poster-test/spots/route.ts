import { NextResponse } from "next/server";
import { posterApiGet } from "@/lib/poster/client";

export const runtime = "nodejs";

type PosterSpotRow = {
  spot_id: number | string;
  name: string;
  address?: string;
};

export async function GET() {
  const result = await posterApiGet<PosterSpotRow[]>("spots.getSpots");

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        message: result.errorText || "Не удалось получить список точек Poster.",
      },
      { status: result.httpStatus || 502 },
    );
  }

  const spots = (result.data ?? []).map((spot) => ({
    id: Number(spot.spot_id),
    name: spot.name,
    address: spot.address ?? null,
  }));

  return NextResponse.json({
    success: true,
    spots,
  });
}
