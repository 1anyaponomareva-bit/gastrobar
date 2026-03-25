import type { NextConfig } from "next";

/** Доп. домены для dev (ngrok и т.д.), если пустая страница: ALLOWED_DEV_ORIGINS=мой-туннель.ngrok-free.dev */
const extraDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
    /** Колесо и прочие файлы из `public/` для `next/image` (Next.js 15). */
    localPatterns: [
      { pathname: "/koleso.png" },
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
