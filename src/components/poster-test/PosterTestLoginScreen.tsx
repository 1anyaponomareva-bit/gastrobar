"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";

type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onPosterTestTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

type PosterTestLoginScreenProps = {
  title?: string;
  subtitle?: string;
  returnTo?: string;
  onSuccess?: () => void;
  compact?: boolean;
};

export function PosterTestLoginScreen({
  title = "Войдите в аккаунт",
  subtitle = "Чтобы оформить заказ, войдите через Google или Telegram.",
  returnTo = "/poster-test/food?checkout=form",
  onSuccess,
  compact = false,
}: PosterTestLoginScreenProps) {
  const { refreshSession } = usePosterTestAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<"google" | "telegram" | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const telegramMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetch("/api/poster-test/auth/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { telegramBotUsername?: string | null }) => {
        setBotUsername(data.telegramBotUsername ?? null);
      })
      .catch(() => setBotUsername(null));
  }, []);

  const handleTelegramAuth = useCallback(
    async (payload: TelegramAuthPayload) => {
      setLoadingProvider("telegram");
      setError(null);
      try {
        const response = await fetch("/api/poster-test/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as { success?: boolean; message?: string };
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Не удалось войти через Telegram.");
        }
        await refreshSession();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка входа через Telegram.");
      } finally {
        setLoadingProvider(null);
      }
    },
    [onSuccess, refreshSession],
  );

  useEffect(() => {
    window.onPosterTestTelegramAuth = (user) => {
      void handleTelegramAuth(user);
    };
    return () => {
      delete window.onPosterTestTelegramAuth;
    };
  }, [handleTelegramAuth]);

  useEffect(() => {
    const mount = telegramMountRef.current;
    if (!botUsername || !mount) return;

    mount.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "16");
    script.setAttribute("data-onauth", "onPosterTestTelegramAuth(user)");
    mount.appendChild(script);
  }, [botUsername]);

  const googleHref = `/api/poster-test/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className={compact ? "space-y-4" : "mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-8"}>
      <div className={compact ? "" : "text-center"}>
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">Личный кабинет</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">{subtitle}</p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <a
          href={googleHref}
          onClick={() => setLoadingProvider("google")}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          <span aria-hidden="true">G</span>
          {loadingProvider === "google" ? "Переход в Google..." : "Continue with Google"}
        </a>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <p className="mb-3 text-center text-xs uppercase tracking-[0.16em] text-white/45">
            Continue with Telegram
          </p>
          {botUsername ? (
            <>
              <div ref={telegramMountRef} className="flex justify-center" />
              {loadingProvider === "telegram" ? (
                <p className="mt-3 text-center text-xs text-white/50">Проверяем вход...</p>
              ) : null}
            </>
          ) : (
            <p className="text-center text-sm text-white/45">
              Telegram Login не настроен (TELEGRAM_BOT_USERNAME).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
