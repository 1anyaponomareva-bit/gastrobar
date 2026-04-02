"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import DurakPageClient from "./DurakPageClient";

class DurakRouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[durak] render error:", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message?.trim();
      return (
        <div
          className="flex min-h-[min(100dvh,900px)] w-full flex-col items-center justify-center gap-4 bg-[#14100c] px-6 py-16 text-center"
          role="alert"
        >
          <p className="text-base font-semibold text-white">Ошибка при отображении игры</p>
          <p className="max-w-sm text-sm text-white/60">
            {msg ||
              "Попробуйте обновить страницу. Если заходите с телефона по Wi‑Fi — откройте тот же адрес, что в `npm run dev` (см. allowedDevOrigins в next.config)."}
          </p>
          <button
            type="button"
            className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm text-white hover:bg-white/15"
            onClick={() => this.setState({ error: null })}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Прямой импорт вместо `dynamic(ssr:false)`: отдельный чанк на части браузеров/сетей не грузился → чёрный экран поверх `body` (#000). */
export function DurakShell() {
  return (
    <DurakRouteErrorBoundary>
      <DurakPageClient />
    </DurakRouteErrorBoundary>
  );
}
