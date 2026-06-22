"use client";

import Link from "next/link";
import { CONFIG } from "@/lib/config";
import { getAssetUrl } from "@/lib/appVersion";
import { HOME_PATH } from "@/lib/routes";
import {
  GASTROBAR_LOGO_HEIGHT_PX,
  GASTROBAR_LOGO_MAX_WIDTH,
  GASTROBAR_LOGO_WIDTH_PX,
} from "@/lib/appShellLayout";

export function StaffShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0c] text-white">
      <header className="border-b border-white/10 bg-[#0a0a0c]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={getAssetUrl(CONFIG.logoSrc)}
              alt="GASTROBAR"
              width={GASTROBAR_LOGO_WIDTH_PX}
              height={GASTROBAR_LOGO_HEIGHT_PX}
              className="object-contain"
              style={{
                height: 40,
                maxWidth: GASTROBAR_LOGO_MAX_WIDTH,
                width: "auto",
              }}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">
                Для сотрудников
              </p>
              <h1 className="truncate text-lg font-semibold">Закупки</h1>
            </div>
          </div>
          <Link
            href={HOME_PATH}
            className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
          >
            Меню
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
