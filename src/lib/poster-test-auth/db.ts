import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBackendUrl } from "@/lib/supabase/backend-url";

let adminClient: SupabaseClient | null | undefined;

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
};

/** Checks that poster_test_users exists and service_role can read it. */
export async function probePosterTestDbSchema(): Promise<PosterTestDbProbe> {
  const client = getPosterTestAdminClient();
  if (!client) {
    return {
      ok: false,
      error: "db_not_configured",
      hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    };
  }

  const { error } = await client.from("poster_test_users").select("id").limit(1);
  if (!error) {
    return { ok: true, error: null, hint: null };
  }

  const message = error.message ?? String(error.code ?? "unknown");
  const code = String(error.code ?? "");
  const missingTable =
    code === "PGRST205" ||
    /poster_test_users/.test(message) &&
      (/does not exist|Could not find the table|schema cache/i.test(message));

  if (missingTable) {
    return {
      ok: false,
      error: "db_schema_missing",
      hint:
        "Run supabase/migrations/20260701120000_poster_test_accounts.sql in the Supabase SQL editor.",
    };
  }

  if (code === "42501" || /permission denied/i.test(message)) {
    return {
      ok: false,
      error: "db_permission_denied",
      hint: "SUPABASE_SERVICE_ROLE_KEY must be the service_role secret from Supabase → Settings → API.",
    };
  }

  return {
    ok: false,
    error: "db_probe_failed",
    hint: message,
  };
}
