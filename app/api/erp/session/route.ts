import { NextResponse } from "next/server";
import { errorResponse, getErpEmail } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    return NextResponse.json({ email: await getErpEmail() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
