"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAssetUrl } from "@/lib/appVersion";
import type { AppLang } from "@/lib/i18n";
import { useTranslation } from "@/lib/useTranslation";

const FLAG_SRC: Record<AppLang, string> = {
  ru: "/flags/ru.svg",
  en: "/flags/gb.svg",
  vn: "/flags/vn.svg",
};

const LANGS: AppLang[] = ["ru", "en", "vn"];

const TRIGGER_BASE =
  "pointer-events-auto flex h-10 min-w-[2.75rem] shrink-0 items-center justify-center gap-1 rounded-full border border-white/30 bg-black/40 px-2.5 text-white backdrop-blur-md transition hover:bg-white/20 focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-400/50 touch-manipulation";

type FlagProps = {
  code: AppLang;
  className?: string;
  width: number;
  height: number;
};

function LangFlag({ code, className, width, height }: FlagProps) {
  return (
    <img
      src={getAssetUrl(FLAG_SRC[code])}
      alt=""
      width={width}
      height={height}
      className={cn("object-cover shadow-sm", className)}
      draggable={false}
      loading="eager"
      decoding="async"
    />
  );
}

function langOptionKey(id: AppLang): `lang_option_${AppLang}` {
  return `lang_option_${id}`;
}

export function LanguageMenu() {
  const { lang, changeLang, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative z-[1001]" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={TRIGGER_BASE}
        aria-label={`${t("aria_language_menu")}: ${t(langOptionKey(lang))}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
      >
        <span className="block overflow-hidden rounded-[3px] ring-1 ring-white/20">
          <LangFlag code={lang} width={30} height={20} className="block" />
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-white/80 transition", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t("aria_language_list")}
          className="absolute right-0 top-[calc(100%+6px)] z-[1002] overflow-hidden rounded-xl border border-white/20 bg-[#0a0a0a]/98 py-1.5 pl-1.5 pr-1 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-md"
        >
          {LANGS.map((id) => {
            const active = id === lang;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={t(langOptionKey(id))}
                onClick={() => {
                  changeLang(id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full min-w-[4.5rem] items-center justify-center px-2 py-2 transition",
                  active ? "bg-amber-500/15" : "hover:bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "block overflow-hidden rounded-[3px] ring-1 ring-inset",
                    active ? "ring-amber-400/60" : "ring-white/15",
                  )}
                >
                  <LangFlag code={id} width={44} height={30} className="block" />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
