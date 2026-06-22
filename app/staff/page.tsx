import type { Metadata } from "next";
import StaffHomeScreen from "@/components/staff/StaffHomeScreen";

export const metadata: Metadata = {
  title: "Закупки — GASTROBAR",
  description: "Внутреннее приложение для сотрудников: что закончилось и что купить.",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return <StaffHomeScreen />;
}
