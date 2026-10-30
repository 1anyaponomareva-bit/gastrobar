"use client";

import { Montserrat } from "next/font/google";
import { useEffect } from "react";

/** Staff tools are used in RU and VN, so the font must ship Cyrillic and Vietnamese glyphs. */
const staffFont = Montserrat({
  subsets: ["latin", "cyrillic", "vietnamese"],
  weight: ["400", "500", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-staff",
});

/** Staff/check: no bottom nav — drop menu body padding in standalone and browser. */
export function StaffToolBodyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add("staff-tool-body");
    return () => {
      document.body.classList.remove("staff-tool-body");
    };
  }, []);

  return (
    <div className={staffFont.variable} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
