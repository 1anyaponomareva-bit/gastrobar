import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { ADMIN_LIST_TTL_MS } from "@/lib/recipes-admin/storage";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";
import { erpLocalMode, localErpClient, localNetworkDelay } from "./localDb";

if (typeof window !== "undefined") throw new Error("erp/server is server-only");

let client: SupabaseClient | null | undefined;

export function erpDb(): SupabaseClient {
  if (erpLocalMode()) return localErpClient as unknown as SupabaseClient;
  if (client === undefined) {
    const url = getSupabaseBackendUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }
  if (!client) throw new ErpHttpError(503, "ERP_NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY");
  return client;
}

export class ErpHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string,
    /** Extra fields sent with the error, e.g. the draft that was saved before posting failed. */
    public extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const LOCAL_DEV_ADMIN = "local-dev@gastrofood";

export async function getErpEmail(): Promise<string | null> {
  if (erpLocalMode()) {
    // Stands for the admin list read of a real session check (same caching) when a network delay is emulated.
    if (Date.now() - localAdminCheckAt > ADMIN_LIST_TTL_MS) {
      await localNetworkDelay();
      localAdminCheckAt = Date.now();
    }
    return LOCAL_DEV_ADMIN;
  }
  return getSessionEmail();
}
let localAdminCheckAt = 0;

/** Server-Timing header (auth / db / total) so slow requests can be split up in the browser. */
export class ServerTiming {
  private started = performance.now();
  private parts: [string, number][] = [];

  async time<T>(name: string, work: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
    const start = performance.now();
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      this.parts.push([name, performance.now() - start]);
    }
  }

  header(): string {
    const parts = this.parts.map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`);
    parts.push(`total;dur=${(performance.now() - this.started).toFixed(1)}`);
    if (process.env.VERCEL_REGION) parts.push(`region;desc=${process.env.VERCEL_REGION}`);
    return parts.join(", ");
  }

  json(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Server-Timing": this.header() } });
  }

  error(error: unknown) {
    const response = errorResponse(error);
    response.headers.set("Server-Timing", this.header());
    return response;
  }
}

export async function requireAdmin(): Promise<string> {
  const email = await getErpEmail();
  if (!email) throw new ErpHttpError(401, "auth");
  return email;
}

/**
 * Runs a read-only query alongside the session check instead of after it. The result is only
 * returned when the check passes, and a failed check wins over any query error.
 */
export async function readAsAdmin<T>(timing: ServerTiming, read: () => PromiseLike<T>): Promise<{ email: string; data: T }> {
  const [email, data] = await Promise.allSettled([timing.time("auth", requireAdmin()), timing.time("db", read)]);
  if (email.status === "rejected") throw email.reason;
  if (data.status === "rejected") throw data.reason;
  return { email: email.value, data: data.value };
}

type DbError = { message?: string; details?: string; code?: string };

/** Throws an ErpHttpError for database errors; ERP_* and constraint errors become 400. */
export function check<T>(result: { data: T | null; error: DbError | null }): T {
  if (!result.error) return result.data as T;
  const message = result.error.message ?? "db";
    if (message.startsWith("ERP_COUNT_OVERLAP")) throw new ErpHttpError(409, message, result.error.details || undefined);
    if (message.startsWith("ERP_")) throw new ErpHttpError(400, message, result.error.details || undefined);
  // Missing table / function: the ERP migration has not been applied to this database.
  if (["PGRST205", "PGRST202", "42P01", "42883"].includes(result.error.code ?? "")) {
    throw new ErpHttpError(503, "ERP_NOT_INSTALLED");
  }
  if (result.error.code === "23505") throw new ErpHttpError(400, "ERP_DUPLICATE", result.error.details || message);
  if (result.error.code === "23514" || result.error.code === "22P02" || result.error.code === "23502") {
    throw new ErpHttpError(400, "ERP_INVALID", message);
  }
  throw new Error(`[erp] ${message}`);
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  return check<T>(await erpDb().rpc(fn, args));
}

export function errorResponse(error: unknown) {
  if (error instanceof ErpHttpError) {
    return NextResponse.json({ ...error.extra, error: error.code, detail: error.detail }, { status: error.status });
  }
  console.error("[erp]", error);
  return NextResponse.json({ error: "server" }, { status: 500 });
}
