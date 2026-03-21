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
  },
  /**
   * Dev: разрешить загрузку /_next/* не только с localhost.
   * Без этого ngrok / Cloudflare Tunnel / телефон по IP ломают сайт (пустая страница).
   * Формат — hostname без протокола; поддерживаются wildcard-поддомены.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.102",
    "192.168.0.1",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.loca.lt",
    "*.trycloudflare.com",
    ...extraDevOrigins,
  ],
};

export default nextConfig;
