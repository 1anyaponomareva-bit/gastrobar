import type { NextConfig } from "next";

/** Доп. домены для dev (ngrok и т.д.), если пустая страница: ALLOWED_DEV_ORIGINS=мой-туннель.ngrok-free.dev */
const extraDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const supabaseBackend =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";

const nextConfig: NextConfig = {
  /**
   * Браузер ходит на тот же origin → /supabase-proxy → реальный Supabase.
   * Иначе прямой fetch к *.supabase.co часто даёт «Load failed» (Safari, встроенные браузеры, блокировки).
   */
  async rewrites() {
    if (!supabaseBackend) return [];
    return [
      {
        source: "/supabase-proxy/rest/v1/:path*",
        destination: `${supabaseBackend}/rest/v1/:path*`,
      },
      {
        source: "/supabase-proxy/auth/v1/:path*",
        destination: `${supabaseBackend}/auth/v1/:path*`,
      },
      {
        source: "/supabase-proxy/storage/v1/:path*",
        destination: `${supabaseBackend}/storage/v1/:path*`,
      },
      {
        source: "/supabase-proxy/functions/v1/:path*",
        destination: `${supabaseBackend}/functions/v1/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      /** Рубашка и лица карт для игры «Дурак» (deckofcardsapi). */
      { protocol: "https", hostname: "deckofcardsapi.com", pathname: "/**" },
    ],
    /** Колесо и прочие файлы из `public/` для `next/image` (Next.js 15). */
    localPatterns: [
      { pathname: "/koleso.png" },
      { pathname: "/fab-wheel-reference.png" },
      { pathname: "/fab-wheel-won.png" },
      { pathname: "/images/**" },
      { pathname: "/menu/**" },
    ],
  },
  /**
   * Dev: разрешить загрузку /_next/* не только с localhost.
   * Иначе с телефона по LAN (http://192.168.x.x:3000) — пустой экран: JS/CSS режутся.
   * Wildcard по октетам как у доменов: 192.168.*.* = любой 192.168.x.y
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.loca.lt",
    "*.trycloudflare.com",
    ...extraDevOrigins,
  ],
};

export default nextConfig;
