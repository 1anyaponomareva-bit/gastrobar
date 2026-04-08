"use client";

import { Suspense, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { DurakGame } from "@/components/durak/DurakGame";

const wrapStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  minHeight: "min(820px, calc(100dvh - 5.5rem))",
  width: "100%",
  maxWidth: "32rem",
  marginLeft: "auto",
  marginRight: "auto",
  flex: 1,
  flexDirection: "column",
  backgroundColor: "#14100c",
  color: "#f1f5f9",
};

function DurakPageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative z-[1] mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col bg-[#14100c]"
      style={wrapStyle}
    >
      {children}
    </div>
  );
}

function DurakPageClientInner() {
  const sp = useSearchParams();
  const raw = sp?.get("stol") ?? null;
  const invite = raw?.trim() ? raw.trim() : null;
  const skipOnlineResume = sp?.get("new") === "1";

  return (
    <DurakPageShell>
      <DurakGame friendInviteCodeFromUrl={invite} skipOnlineResume={skipOnlineResume} />
    </DurakPageShell>
  );
}

function DurakPageSuspenseFallback() {
  return (
    <DurakPageShell>
      <div className="flex flex-1 items-center justify-center py-20">
        <span className="text-sm text-white/50" style={{ color: "rgba(248,250,252,0.55)", fontSize: 14 }}>
          Загрузка…
        </span>
      </div>
    </DurakPageShell>
  );
}

/** Единый flex-поток с `durak-page`: всегда занимаем оставшуюся высоту под шапкой. */
export default function DurakPageClient() {
  return (
    <Suspense fallback={<DurakPageSuspenseFallback />}>
      <DurakPageClientInner />
    </Suspense>
  );
}
