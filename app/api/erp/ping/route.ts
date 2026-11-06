import { check, erpDb, requireAdmin, ServerTiming } from "@/lib/erp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Speed check: where the server runs and how long the session check and one database query take. */
export async function GET() {
  const timing = new ServerTiming();
  try {
    const authStart = performance.now();
    await timing.time("auth", requireAdmin());
    const authMs = performance.now() - authStart;
    const dbMs: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      check(await timing.time("db", erpDb().from("erp_settings").select("id").eq("id", 1).maybeSingle()));
      dbMs.push(performance.now() - start);
    }
    return timing.json({
      region: process.env.VERCEL_REGION ?? null,
      authMs: Math.round(authMs),
      dbMs: dbMs.map(Math.round),
    });
  } catch (error) {
    return timing.error(error);
  }
}
