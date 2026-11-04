import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";
import { erpLocalMode, localErpClient } from "./localDb";

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
  ) {
    super(code);
  }
}

export const LOCAL_DEV_ADMIN = "local-dev@gastrofood";

export async function getErpEmail(): Promise<string | null> {
  if (erpLocalMode()) return LOCAL_DEV_ADMIN;
  return getSessionEmail();
}

export async function requireAdmin(): Promise<string> {
  const email = await getErpEmail();
  if (!email) throw new ErpHttpError(401, "auth");
  return email;
}

type DbError = { message?: string; details?: string; code?: string };

/** Throws an ErpHttpError for database errors; ERP_* and constraint errors become 400. */
export function check<T>(result: { data: T | null; error: DbError | null }): T {
  if (!result.error) return result.data as T;
  const message = result.error.message ?? "db";
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
    return NextResponse.json({ error: error.code, detail: error.detail }, { status: error.status });
  }
  console.error("[erp]", error);
  return NextResponse.json({ error: "server" }, { status: 500 });
}
