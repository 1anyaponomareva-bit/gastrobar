import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HEADER_OFFSET_TOP } from "@/components/durak/durakLayoutConstants";
import { DurakShell } from "./DurakShell";

export const metadata: Metadata = {
  title: "Дурак — GASTROBAR",
  description: "Подкидной дурак: игра против бота.",
};

const durakPageShellStyle: React.CSSProperties = {
  position: "relative",
  isolation: "isolate",
  zIndex: 0,
  display: "flex",
  minHeight: "100vh",
  width: "100%",
  flexDirection: "column",
  backgroundColor: "#14100c",
  color: "#f1f5f9",
};

const durakMainColumnStyle: CSSProperties = {
  display: "flex",
  minHeight: "calc(100vh - 5rem)",
  width: "100%",
  minWidth: 0,
  flex: 1,
  flexDirection: "column",
  overflowX: "hidden",
  paddingTop: "calc(60px + max(0px, env(safe-area-inset-top, 0px)))",
  backgroundColor: "#14100c",
  color: "#f1f5f9",
};

export default function DurakPage() {
  return (
    <div
      className={`relative isolate z-0 flex min-h-[100dvh] min-h-[100svh] w-full flex-col bg-[#14100c] text-white`}
      style={durakPageShellStyle}
    >
      <Header />
      <div
        className={`durak-page flex min-h-[calc(100svh-5rem)] w-full min-w-0 flex-1 flex-col overflow-x-hidden ${HEADER_OFFSET_TOP}`}
        style={durakMainColumnStyle}
      >
        <DurakShell />
      </div>
      <BottomNav />
    </div>
  );
}
