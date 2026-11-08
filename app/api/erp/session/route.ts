import { NextResponse } from "next/server";
import { errorResponse, getErpEmail, LOCAL_DEV_ADMIN } from "@/lib/erp/server";
import { erpLocalMode } from "@/lib/erp/localDb";
import { displayNameForEmail } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const email = await getErpEmail();
    const name = !email ? "" : erpLocalMode() && email === LOCAL_DEV_ADMIN ? "Local" : await displayNameForEmail(email);
    return NextResponse.json({ email, name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
