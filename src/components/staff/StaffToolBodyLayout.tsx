"use client";

import { useEffect } from "react";

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

  return children;
}
