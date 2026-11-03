import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { translateTexts } from "@/lib/recipes-admin/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Body: { text }; returns the Vietnamese translation of an English item or category name. */
export async function POST(request: Request) {
  try {
    if (!(await getSessionEmail())) {
      return NextResponse.json({ error: "auth" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 120) : "";
    if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const result = await translateTexts([{ id: 1, from: "en", text, to: ["vn"] }]);
    const vn = result.get(1)?.vn;
    if (!vn) return NextResponse.json({ error: "translate" }, { status: 502 });
    return NextResponse.json({ vn });
  } catch (error) {
    console.error("[staff-admin] translate", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
