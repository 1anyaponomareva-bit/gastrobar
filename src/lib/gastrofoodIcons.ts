/** Cache-bust so browsers pick up the transparent GASTROFOOD logo. */
export const GASTROFOOD_ICON_VERSION = "20261109b";

export const GASTROFOOD_FAVICON_32 = `/gastrofood/favicon-32.png?v=${GASTROFOOD_ICON_VERSION}`;
export const GASTROFOOD_ICON_192 = `/gastrofood/icon-192.png?v=${GASTROFOOD_ICON_VERSION}`;
export const GASTROFOOD_APPLE_TOUCH = `/gastrofood/apple-touch-icon.png?v=${GASTROFOOD_ICON_VERSION}`;

export const gastrofoodMetadataIcons = {
  icon: [
    { url: GASTROFOOD_FAVICON_32, type: "image/png", sizes: "32x32" },
    { url: GASTROFOOD_ICON_192, type: "image/png", sizes: "192x192" },
  ],
  apple: [{ url: GASTROFOOD_APPLE_TOUCH, sizes: "180x180" }],
};
