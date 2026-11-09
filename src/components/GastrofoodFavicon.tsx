"use client";

import { useEffect } from "react";
import { GASTROFOOD_APPLE_TOUCH, GASTROFOOD_FAVICON_32, GASTROFOOD_ICON_192 } from "@/lib/gastrofoodIcons";

const ICONS = [
  { rel: "icon", type: "image/png", sizes: "32x32", href: GASTROFOOD_FAVICON_32 },
  { rel: "icon", type: "image/png", sizes: "192x192", href: GASTROFOOD_ICON_192 },
  { rel: "apple-touch-icon", sizes: "180x180", href: GASTROFOOD_APPLE_TOUCH },
] as const;

/** Tab icon: large black G and red F on a transparent background. */
export function GastrofoodFavicon() {
  useEffect(() => {
    document
      .querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')
      .forEach((el) => el.remove());
    for (const icon of ICONS) {
      const link = document.createElement("link");
      link.rel = icon.rel;
      link.href = icon.href;
      if ("type" in icon && icon.type) link.type = icon.type;
      if (icon.sizes) link.setAttribute("sizes", icon.sizes);
      document.head.appendChild(link);
    }
  }, []);
  return null;
}
