import { StaffShell } from "@/components/staff/StaffShell";

export default function StaffHomeScreen() {
  return (
    <StaffShell>
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-xl font-semibold">Что купить</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Здесь будет список того, чего не хватает на точке: отметки «мало» и
            «закончилось», общий список закупок для гастротрака и бара.
          </p>
        </section>

        <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-center">
          <p className="text-sm text-white/50">Раздел в разработке</p>
          <p className="mt-1 text-xs text-white/35">
            Следующий шаг — список продуктов и кнопки остатка
          </p>
        </section>
      </div>
    </StaffShell>
  );
}
