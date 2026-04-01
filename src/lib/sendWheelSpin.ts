import { getSupabasePublicApiKey } from "@/lib/supabase/public-key";

/**
 * Запись спина через Supabase PostgREST (fetch) — без @supabase/supabase-js,
 * чтобы сборка не падала, если пакет не попал в node_modules / package-lock.
 */
async function insertSpinRow(row: { user_id: string; result: string }): Promise<Error | null> {
  const key = getSupabasePublicApiKey();
  const backend = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!key || !backend) {
    return new Error(
      "missing NEXT_PUBLIC_SUPABASE_URL and public API key (NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/supabase-proxy`
      : backend;

  const res = await fetch(`${base}/rest/v1/spins`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify([row]),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return new Error(text || `${res.status} ${res.statusText}`);
  }
  return null;
}

/** Запись спина (клиент, после завершения анимации колеса). */
export async function sendSpin(result: string) {
  try {
    const userId = localStorage.getItem("user_id") || crypto.randomUUID();
    localStorage.setItem("user_id", userId);

    const err = await insertSpinRow({ user_id: userId, result });
    if (err) {
      console.error("spin error", err);
      return;
    }

    console.log("spin saved", result);
  } catch (e) {
    console.error("spin error", e);
  }
}
