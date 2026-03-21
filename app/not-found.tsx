import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-white">
      <h1 className="text-2xl font-semibold mb-2">404</h1>
      <p className="text-white/70 text-sm text-center mb-6">
        Страница не найдена.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/20"
      >
        На главную
      </Link>
    </div>
  );
}
