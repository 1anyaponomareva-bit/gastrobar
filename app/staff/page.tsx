import type { Metadata } from "next";
import StaffHomeScreen from "@/components/staff/StaffHomeScreen";

export const metadata: Metadata = {
  title: "Inventory — GASTROBAR",
  description:
    "Internal staff app: track stock and purchase orders for GastroFood and GastroBar.",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return <StaffHomeScreen />;
}
