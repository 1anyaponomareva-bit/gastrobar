"use client";

import type { CSSProperties } from "react";
import { DurakGame } from "@/components/durak/DurakGame";

const wrapStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  minHeight: "min(85vh, 820px)",
  width: "100%",
  maxWidth: "32rem",
  marginLeft: "auto",
  marginRight: "auto",
  flex: 1,
  flexDirection: "column",
  backgroundColor: "#14100c",
  color: "#f1f5f9",
};

/** Единый flex-поток с `durak-page`: всегда занимаем оставшуюся высоту под шапкой. */
export default function DurakPageClient() {
  return (
    <div
      className="relative z-[1] mx-auto flex min-h-[min(85dvh,820px)] w-full max-w-lg flex-1 flex-col bg-[#14100c]"
      style={wrapStyle}
    >
      <DurakGame />
    </div>
  );
}
