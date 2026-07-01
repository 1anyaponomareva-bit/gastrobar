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
