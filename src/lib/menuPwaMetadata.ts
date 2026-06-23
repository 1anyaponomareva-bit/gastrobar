import type { Metadata } from "next";

/** PWA metadata only for public menu routes — not staff/check. */
export const MENU_PWA_METADATA: Metadata = {
  applicationName: "GASTROBAR",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GASTROBAR",
  },
};
