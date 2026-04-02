"use client";

export default function DurakError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#14100c] px-6 py-16 text-center text-white"
      role="alert"
    >
      <h1 className="text-base font-semibold text-white/95">Не удалось открыть игру</h1>
      <p className="max-w-sm text-sm text-white/60">
        {error.message?.trim()
          ? error.message
          : "Обновите страницу. Если снова пусто — откройте сайт в другом браузере или режиме без блокировки скриптов."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15"
      >
        Попробовать снова
      </button>
    </div>
  );
}
