/**
 * Ключ для исходящих запросов с Route Handler (прокси) к PostgREST.
 * Предпочтительно SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY только на сервере Vercel
 * (не префикс NEXT_PUBLIC_), иначе — публикуемые ключи из env сборки.
 */
export function getSupabaseServerAnonKey(): string {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}
