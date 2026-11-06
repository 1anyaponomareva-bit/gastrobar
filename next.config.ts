import type { NextConfig } from "next";
import { CANONICAL_ERP_HOST, ERP_PAGE_SEGMENTS, ERP_WWW_HOST } from "./src/lib/erp/publicPath";

/** Доп. домены для dev (ngrok и т.д.), если пустая страница: ALLOWED_DEV_ORIGINS=мой-туннель.ngrok-free.dev */
const extraDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  /**
   * /food stays on this site. /schedule is a separate Vercel project.
   * fallback runs only when this app has no matching page, so the homepage,
   * /staff, /kitchen and /food are left untouched.
   */
  async rewrites() {
    // beforeFiles runs before the prerendered homepage, so gastrofood.vn/ is ERP
    // instead of the cached «Еда / Бар» page. Host-keyed, so gastrotruck.org `/` stays static.
    const erpHosts = [CANONICAL_ERP_HOST, ERP_WWW_HOST];
    const erpHostRewrites = erpHosts.flatMap((host) => {
      const hasHost = [{ type: "host" as const, value: host }];
      return [
        { source: "/", has: hasHost, destination: "/erp" },
        ...ERP_PAGE_SEGMENTS.flatMap((seg) => [
          { source: `/${seg}`, has: hasHost, destination: `/erp/${seg}` },
          { source: `/${seg}/:path*`, has: hasHost, destination: `/erp/${seg}/:path*` },
        ]),
      ];
    });
    return {
      beforeFiles: erpHostRewrites,
      afterFiles: [{ source: "/food", destination: "/food/index.html" }],
      fallback: [
        { source: "/schedule", destination: "https://gastrofood-schedule.vercel.app/schedule" },
        { source: "/schedule/:path*", destination: "https://gastrofood-schedule.vercel.app/schedule/:path*" },
      ],
    };
  },
  /** PostgREST прокси (если кто-то бьёт в `/supabase-proxy`): `app/supabase-proxy/[[...path]]/route.ts`. */
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
      { pathname: "/durak.png" },
      { pathname: "/morskboi.png" },
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
