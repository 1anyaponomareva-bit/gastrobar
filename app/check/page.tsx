import type { Metadata } from "next";
import CheckHomeScreen from "@/components/check/CheckHomeScreen";

export const metadata: Metadata = {
  title: "Shift Checklist — GASTROBAR",
  description:
    "Opening and closing shift checklist for GastroFood and GastroBar staff.",
  robots: { index: false, follow: false },
};

export default function CheckPage() {
  return <CheckHomeScreen />;
}
