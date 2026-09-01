"use client";

import { getAssetUrl } from "@/lib/appVersion";
import type { AppLang } from "@/lib/i18n";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import { cn } from "@/lib/utils";

const FLAG_SRC: Record<"ru" | "en" | "vn", string> = {
  ru: "/flags/ru.svg",
  en: "/flags/gb.svg",
  vn: "/flags/vn.svg",
};

const LANGS: Array<"ru" | "en" | "vn"> = ["ru", "en", "vn"];

function langOptionKey(id: AppLang): `lang_option_${AppLang}` {
  return `lang_option_${id}`;
}

export function StaffLanguageFlags() {
  const { lang, changeLang, t } = useTranslation();
  const staffLang = toStaffAppLang(lang);

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/35 p-1 backdrop-blur-md"
      role="group"
      aria-label={t("aria_language_list")}
    >
      {LANGS.map((id) => {
        const active = id === staffLang;
        return (
          <button
            key={id}
            type="button"
            onClick={() => changeLang(id)}
            aria-label={t(langOptionKey(id))}
            aria-pressed={active}
            className={cn(
              "rounded-full p-0.5 transition",
              active ? "bg-amber-500/20 ring-1 ring-amber-400/70" : "hover:bg-white/10",
            )}
          >
            <span
              className={cn(
                "block overflow-hidden rounded-[3px] ring-1 ring-inset",
                active ? "ring-amber-400/50" : "ring-white/15",
              )}
            >
              <img
                src={getAssetUrl(FLAG_SRC[id])}
                alt=""
                width={36}
                height={24}
                className="block object-cover"
                draggable={false}
                loading="eager"
                decoding="async"
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
