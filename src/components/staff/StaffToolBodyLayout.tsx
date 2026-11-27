"use client";

import { Montserrat } from "next/font/google";
import { useEffect } from "react";

/** Staff tools are used in RU and VN, so the font must ship Cyrillic and Vietnamese glyphs.
 * Keep weights slim — extra faces (500/900/italic) made Orders/Staff open slowly on mobile. */
const staffFont = Montserrat({
  subsets: ["latin", "cyrillic", "vietnamese"],
  weight: ["400", "700", "800"],
  style: ["normal"],
  variable: "--font-staff",
  display: "swap",
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
