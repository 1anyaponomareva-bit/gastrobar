import { createClient } from "@supabase/supabase-js";

/** Клиент Supabase для браузера (anon key). */
export function createSupabaseBrowserClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !key) {
    return null;
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  return createClient(url, key, {
    global: {
      fetch: (input, init) =>
        fetch(input, init).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(
            `Сеть Supabase: ${msg}. Проверьте URL проекта и что домен *.supabase.co не блокируется.`
          );
        }),
    },
  });
}
