/** Anon JWT или publishable key (`sb_publishable_…`) — из тех же env, что и URL. */
export function getSupabasePublicApiKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}
