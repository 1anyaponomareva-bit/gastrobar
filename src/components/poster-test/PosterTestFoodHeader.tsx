"use client";

import { CONFIG } from "@/lib/config";
import { getAssetUrl } from "@/lib/appVersion";
import { POSTER_FOOD_LOGO_LIGHT } from "@/lib/poster/constants";
import { useTranslation } from "@/lib/useTranslation";
import { PosterTestHeaderActions } from "@/components/poster-test/PosterTestHeaderActions";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function PosterTestFoodHeader() {
  const { t } = useTranslation();

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-side header-side--left">
          <a
            href={CONFIG.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            aria-label="Telegram"
          >
            <TelegramIcon className="h-5 w-5 shrink-0" />
          </a>
          <a
            href="https://maps.app.goo.gl/ihhQ16yVfRDdtRzcA"
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            aria-label={t("aria_map")}
          >
            <LocationIcon className="h-5 w-5 shrink-0" />
          </a>
        </div>

        <div className="header-logo">
          <img
            src={getAssetUrl(POSTER_FOOD_LOGO_LIGHT)}
            alt="GASTROFOOD"
            className="header-logo__img"
            width={220}
            height={76}
            draggable={false}
          />
        </div>

        <div className="header-side header-side--right poster-test-header-actions-wrap">
          <PosterTestHeaderActions tone="light" />
        </div>
      </div>
    </header>
  );
}
