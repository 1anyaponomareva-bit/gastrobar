export type DeliverPdfResult = "shared" | "downloaded" | "cancelled" | "failed";

export type DeliverPdfShareMeta = {
  title?: string;
  text?: string;
};

export type PdfDeliveryChoice = "share" | "download";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ often reports as Mac in Safari and home-screen PWAs.
  return /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export type InAppBrowserInfo = { platform: "ios" | "android" | "other" } | null;

export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof navigator === "undefined") return null;
  if (!/Zalo|FBAN|FBAV|Instagram|Line\/|Messenger|Telegram/i.test(navigator.userAgent)) {
    return null;
  }
  if (isIosDevice()) return { platform: "ios" };
  if (isAndroidDevice()) return { platform: "android" };
  return { platform: "other" };
}

export function androidChromeIntentUrl(href: string): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;end`;
}

function hasTouchScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.maxTouchPoints > 0) return true;
  return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
}

/** Phones and tablets should attempt the native share sheet when `canShare` is missing. */
export function isMobileOrTouchShareTarget(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  if (isIosDevice()) return true;
  if (
    "userAgentData" in navigator &&
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true
  ) {
    return true;
  }
  return hasTouchScreen();
}

/**
 * Download only when Web Share + files is unavailable (typical desktop).
 * Never use this after a share attempt — AbortError / NotAllowedError must not download.
 */
export function choosePdfDelivery(input: {
  hasShare: boolean;
  canShareFiles: boolean | null;
  mobileOrTouch: boolean;
}): PdfDeliveryChoice {
  if (!input.hasShare) return "download";
  if (input.canShareFiles === true) return "share";
  if (input.canShareFiles === false) return "download";
  return input.mobileOrTouch ? "share" : "download";
}

export function interpretShareError(error: unknown): "cancelled" | "failed" {
  const name =
    error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  return name === "AbortError" ? "cancelled" : "failed";
}

/**
 * Invoke share immediately, then persist without awaiting the server first.
 * Awaiting POST before `navigator.share` drops the user gesture (NotAllowedError → old download fallback).
 */
export function beginShareThenPersist<T>(
  share: () => Promise<T>,
  persist: () => void | Promise<unknown>,
): Promise<T> {
  const shared = share();
  try {
    void Promise.resolve(persist()).catch(() => undefined);
  } catch {
    // persist() already reports its own errors
  }
  return shared;
}

function safePdfFileName(fileName: string): string {
  const cleaned = fileName.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned || "export"}.pdf`;
}

function buildPdfFileFromBlob(blob: Blob, fileName: string): File {
  return new File([blob], safePdfFileName(fileName), {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

function downloadPdfFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safePdfFileName(fileName);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function readCanShareFiles(file: File): boolean | null {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return null;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function sharePayload(file: File, meta?: DeliverPdfShareMeta): ShareData {
  // iOS shares the page URL instead of the file when title/text/url are included.
  if (isIosDevice()) {
    return { files: [file] };
  }
  const data: ShareData = { files: [file] };
  if (meta?.title) data.title = meta.title;
  if (meta?.text) data.text = meta.text;
  return data;
}

/**
 * Phones/tablets: native share sheet with a real PDF file attachment only.
 * Desktop: download the PDF file.
 * Share is always from the in-memory File in this turn — no network before navigator.share.
 */
export async function deliverPdfFile(
  blob: Blob,
  fileName: string,
  meta?: DeliverPdfShareMeta,
): Promise<DeliverPdfResult> {
  const file = buildPdfFileFromBlob(blob, fileName);
  const hasShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mode = choosePdfDelivery({
    hasShare,
    canShareFiles: hasShare ? readCanShareFiles(file) : false,
    mobileOrTouch: isMobileOrTouchShareTarget(),
  });

  if (mode === "download") {
    downloadPdfFile(blob, fileName);
    return "downloaded";
  }

  try {
    await navigator.share(sharePayload(file, meta));
    return "shared";
  } catch (error) {
    return interpretShareError(error);
  }
}
