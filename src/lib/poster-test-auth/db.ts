import dns from "node:dns";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let adminClient: SupabaseClient | null | undefined;

export function getPosterTestSupabaseHost(): string | null {
  const url = getSupabaseBackendUrl();
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function getPosterTestAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;

  const url = getSupabaseBackendUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !serviceKey) {
    adminClient = null;
    return null;
  }

  adminClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return adminClient;
}

export function isPosterTestDbConfigured(): boolean {
  return getPosterTestAdminClient() !== null;
}

export type PosterTestDbProbe = {
  ok: boolean;
  error: string | null;
  hint: string | null;
  supabaseHost: string | null;
};

function fetchErrorHint(error: unknown, host: string | null): string {
  const msg = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
  const causeStr =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}`
      : cause != null
        ? String(cause)
        : "";
  const combined = `${msg} ${causeStr}`;

  if (/ENOTFOUND|getaddrinfo|NXDOMAIN/i.test(combined)) {
    return host
      ? `Хост ${host} не существует (ENOTFOUND). Откройте Supabase → Settings → API, скопируйте актуальный Project URL в Vercel → NEXT_PUBLIC_SUPABASE_URL и сделайте Redeploy.`
      : "Некорректный NEXT_PUBLIC_SUPABASE_URL в Vercel.";
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(combined)) {
    return "Сервер не может подключиться к Supabase. Проверьте, что проект не на паузе (Supabase Dashboard).";
  }
  return combined.trim() || msg;
}

/** Checks that poster_test_users exists and service_role can read it. */
export async function probePosterTestDbSchema(): Promise<PosterTestDbProbe> {
  const supabaseHost = getPosterTestSupabaseHost();
  const client = getPosterTestAdminClient();
  if (!client) {
    return {
      ok: false,
      error: "db_not_configured",
      hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
      supabaseHost,
    };
  }

  let error: { message?: string; code?: string } | null = null;
  try {
    const result = await client.from("poster_test_users").select("id").limit(1);
    error = result.error;
  } catch (probeError) {
    return {
      ok: false,
      error: "db_connection_failed",
      hint: fetchErrorHint(probeError, supabaseHost),
      supabaseHost,
    };
  }

  if (!error) {
    return { ok: true, error: null, hint: null, supabaseHost };
  }

  const message = error.message ?? String(error.code ?? "unknown");
  const code = String(error.code ?? "");
  const missingTable =
    code === "PGRST205" ||
    (/poster_test_users/.test(message) &&
      /does not exist|Could not find the table|schema cache/i.test(message));

  if (missingTable) {
    return {
      ok: false,
      error: "db_schema_missing",
      hint:
        "Run supabase/sql/poster_test_accounts_apply.sql in Supabase → SQL Editor, then check /api/poster-test/auth/config.",
      supabaseHost,
    };
  }

  if (code === "42501" || /permission denied/i.test(message)) {
    return {
      ok: false,
      error: "db_permission_denied",
      hint: "SUPABASE_SERVICE_ROLE_KEY must be the service_role secret from Supabase → Settings → API.",
      supabaseHost,
    };
  }

  if (/fetch failed/i.test(message)) {
    return {
      ok: false,
      error: "db_connection_failed",
      hint: fetchErrorHint(new Error(message), supabaseHost),
      supabaseHost,
    };
  }

  return {
    ok: false,
    error: "db_probe_failed",
    hint: message,
    supabaseHost,
  };
}
