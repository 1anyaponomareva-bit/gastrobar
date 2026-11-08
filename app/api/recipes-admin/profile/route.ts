import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { displayNameForEmail, saveAccountName } from "@/lib/recipes-admin/storage";
import { isValidPersonName, normalizePersonName } from "@/lib/orders/person";
import { rememberOrderUser } from "@/lib/erp/supplierOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json({ error: "auth" }, { status: 401 });
    return NextResponse.json({ email, name: await displayNameForEmail(email) });
  } catch (error) {
    console.error("[recipes-admin] profile get", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json({ error: "auth" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = normalizePersonName(body.name);
    if (!isValidPersonName(name)) {
      return NextResponse.json({ error: "name" }, { status: 400 });
    }
    await saveAccountName(email, name);
    await rememberOrderUser(email, name);
    return NextResponse.json({ email, name });
  } catch (error) {
    console.error("[recipes-admin] profile save", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
