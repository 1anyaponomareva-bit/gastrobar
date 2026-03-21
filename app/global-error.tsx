"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-6 text-white font-sans antialiased">
        <h1 className="text-xl font-semibold mb-2">Что-то пошло не так</h1>
        <p className="text-white/70 text-sm text-center mb-6">
          Обновите страницу или попробуйте позже.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/20 transition-colors"
        >
          Обновить
        </button>
      </body>
    </html>
  );
}
