import { BonusWheelEight } from "@/components/bonus-wheel/BonusWheelEight";

export const metadata = {
  title: "Колесо — превью",
  robots: "noindex, nofollow",
};

export default function WheelDemoPage() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0a0a0a] px-4 py-10"
      style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}
    >
      <h1 className="mb-6 max-w-md text-center text-sm font-medium tracking-wide text-white/80">
        Превью колеса (8 секторов) — только визуал и анимация
      </h1>
      <BonusWheelEight demoMode />
      <a href="/" className="mt-10 text-xs text-white/40 underline underline-offset-2">
        На главную
      </a>
    </div>
  );
}
