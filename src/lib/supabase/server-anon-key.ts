/**
 * Anon / publishable key для исходящих запросов с Route Handler (прокси) к PostgREST.
 * Только `NEXT_PUBLIC_*` — тот же ключ, что в браузерном клиенте.
 */
export function getSupabaseServerAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}
