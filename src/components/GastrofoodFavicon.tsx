"use client";

import { useEffect } from "react";

const ICONS = [
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/gastrofood/favicon-32.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/gastrofood/apple-touch-icon.png" },
] as const;

/** Replaces the gastrotruck.org GASTROBAR tab icon while the stub is on screen. */
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
