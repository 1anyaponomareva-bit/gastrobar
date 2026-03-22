"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  isLiveNowVietnam,
  liveUrl,
  profileUrl,
} from "@/lib/tiktokLive";

/** Совпадает с базовым положением LuckyWheelButton без ленты таймера */
const FAB_BOTTOM = "max(90px, calc(env(safe-area-inset-bottom, 0px) + 60px))";
/** Зеркально right у LuckyWheelButton */
const FAB_LEFT = "max(16px, calc(env(safe-area-inset-left, 0px) + 16px))";

/** Выше контента (табы ~999), ниже полноэкранных модалок (1100+) */
const FAB_Z = 1020;

export function TikTokButton() {
  const [live, setLive] = useState(false);

  const sync = useCallback(() => {
    setLive(isLiveNowVietnam());
  }, []);

  useEffect(() => {
    sync();
    const t = setInterval(sync, 30_000);
    return () => clearInterval(t);
  }, [sync]);

  const handleClick = () => {
    const url = isLiveNowVietnam() ? liveUrl : profileUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed pointer-events-none"
      style={{
        bottom: FAB_BOTTOM,
        left: FAB_LEFT,
        zIndex: FAB_Z,
      }}
    >
      {/* Обёртка без rounded-full — плашка LIVE не режется; клики только на кнопке */}
      <div className="pointer-events-auto relative h-16 w-16 overflow-visible">
        {live && (
          <span
            className="absolute right-0 top-0 z-20 flex translate-x-[14%] -translate-y-[14%] items-center gap-1 rounded-lg border border-white/10 bg-black/82 px-2 py-1 pl-1.5 shadow-md backdrop-blur-[10px]"
            aria-hidden
          >
            <motion.span
              className="h-2 w-2 shrink-0 rounded-full bg-[#fe2c55] shadow-[0_0_8px_rgba(254,44,85,0.55)]"
              animate={{ opacity: [1, 0.42, 1] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <span className="text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-white">
              LIVE
            </span>
          </span>
        )}
        <motion.button
          type="button"
          onClick={handleClick}
          whileTap={{ scale: 0.97 }}
          animate={
            live
              ? {
                  boxShadow:
                    "0 5px 18px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)",
                }
              : {
                  boxShadow:
                    "0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.07)",
                }
          }
          transition={{ duration: 0.2 }}
          className={`absolute inset-0 flex cursor-pointer items-center justify-center rounded-full border text-white/90 backdrop-blur-md transition-colors ${
            live
              ? "border-white/15 bg-black/55"
              : "border-white/10 bg-black/50"
          }`}
          aria-label={live ? "TikTok — смотреть эфир LIVE" : "TikTok — открыть профиль"}
        >
          <Image
            src="/images/tiktok-icon.png"
            alt=""
            width={112}
            height={112}
            className="pointer-events-none h-[52px] w-[52px] select-none rounded-full object-cover"
            aria-hidden
          />
        </motion.button>
      </div>
    </div>
  );
}
