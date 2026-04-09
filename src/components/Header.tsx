"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useBarHome } from "@/components/BarHomeContext";
import { CONFIG } from "@/lib/config";
import { abandonDurakStoredRoom } from "@/lib/durak/activeRoomStorage";

const ICON_BUTTON_CLASS =
  "pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-md transition hover:bg-white/20";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  useTheme();
  const { requestBarHome } = useBarHome();
  const pathname = usePathname();
  const path = pathname ?? "";
  const isGameRoute = path === "/games" || path === "/durak" || path.startsWith("/durak/");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="pointer-events-none fixed left-0 top-0 z-[1000] w-full bg-black"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        zIndex: 1000,
        background: "#000",
        /* Один раз: вырез/status bar; полоса контента ровно 60px ниже (box-sizing: content-box). */
        paddingTop: "env(safe-area-inset-top, 0px)",
        boxSizing: "content-box",
      }}
    >
      {/* Контейнер: Telegram и локация слева, логотип по центру, RU справа */}
      <div className="relative mx-auto flex h-[60px] min-h-[60px] max-w-md items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <a
            href={CONFIG.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={ICON_BUTTON_CLASS}
            aria-label="Telegram"
          >
            <TelegramIcon className="h-5 w-5" />
          </a>
          <a
            href="https://maps.app.goo.gl/ihhQ16yVfRDdtRzcA"
            target="_blank"
            rel="noopener noreferrer"
            className={ICON_BUTTON_CLASS}
            aria-label="Открыть на карте"
          >
            <LocationIcon className="h-5 w-5" />
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center bg-transparent">
          {isGameRoute ? (
            <Link
              href="/"
              onClick={() => abandonDurakStoredRoom()}
              className="pointer-events-auto flex items-center justify-center rounded-2xl bg-transparent p-1 transition-opacity hover:opacity-90 active:opacity-80"
              aria-label="На главную — GASTROBAR"
            >
              <span className="relative block h-[52px] w-[160px] max-w-[calc(100vw-9rem)] shrink-0">
                <Image
                  src={CONFIG.logoSrc}
                  alt="GASTROBAR"
                  fill
                  sizes="160px"
                  priority
                  unoptimized
                  className="object-contain object-center drop-shadow-[0_2px_24px_rgba(0,0,0,0.75)]"
                  draggable={false}
                />
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={requestBarHome}
              className="pointer-events-auto flex items-center justify-center rounded-2xl bg-transparent p-1 transition-opacity hover:opacity-90 active:opacity-80"
              aria-label="На главный экран — Бар"
            >
              <span className="relative block h-[52px] w-[160px] max-w-[calc(100vw-9rem)] shrink-0">
                <Image
                  src={CONFIG.logoSrc}
                  alt="GASTROBAR"
                  fill
                  sizes="160px"
                  priority
                  unoptimized
                  className="object-contain object-center drop-shadow-[0_2px_24px_rgba(0,0,0,0.75)]"
                  draggable={false}
                />
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          className={ICON_BUTTON_CLASS + " text-xs font-semibold uppercase tracking-[0.16em]"}
        >
          RU
        </button>
      </div>
    </motion.header>
  );
}
