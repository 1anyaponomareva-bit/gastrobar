/** Legacy anon JWT или новый Publishable key (`sb_publishable_…`) — оба подходят для клиента. */
export function getSupabasePublicApiKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}
