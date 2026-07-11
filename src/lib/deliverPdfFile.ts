export type DeliverPdfResult = "shared" | "downloaded" | "cancelled";

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

function hasTouchScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.maxTouchPoints > 0) return true;
  return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
}

function shouldUseNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  if (isIosDevice()) return true;
  if (
    "userAgentData" in navigator &&
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
      .userAgentData?.mobile === true
  ) {
    return true;
  }
  // Touch tablets (Lenovo Tab, Surface, etc.) — share, never auto-download.
  if (hasTouchScreen()) return true;
  return false;
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

function buildPdfFileFromBytes(bytes: ArrayBuffer, fileName: string): File {
  return new File([bytes], safePdfFileName(fileName), {
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

async function tryNativeFileShare(file: File): Promise<DeliverPdfResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    throw new Error("File sharing is not supported in this browser.");
  }

  // iOS shares a page URL instead of the file when title/text/url are included.
  const shareData: ShareData = { files: [file] };

  try {
    await navigator.share(shareData);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    throw error;
  }
}

async function fetchPdfFileViaServer(
  bytes: ArrayBuffer,
  fileName: string,
): Promise<File> {
  const response = await fetch("/api/export-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Name": encodeURIComponent(safePdfFileName(fileName)),
    },
    body: bytes,
  });

  if (!response.ok) {
    throw new Error("Failed to prepare PDF for sharing.");
  }

  const serverBlob = await response.blob();
  return buildPdfFileFromBlob(serverBlob, fileName);
}

function uniqueFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const unique: File[] = [];
  files.forEach((file) => {
    const key = `${file.name}:${file.size}:${file.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(file);
  });
  return unique;
}

function orderCandidatesForShare(candidates: File[]): File[] {
  if (typeof navigator.canShare !== "function") {
    return candidates;
  }

  const supported = candidates.filter((file) =>
    navigator.canShare!({ files: [file] }),
  );
  if (supported.length) {
    return uniqueFiles([...supported, ...candidates]);
  }

  return candidates;
}

async function buildShareFileCandidates(
  blob: Blob,
  fileName: string,
): Promise<File[]> {
  const safeName = safePdfFileName(fileName);
  const directFile = buildPdfFileFromBlob(blob, safeName);

  // Android: share immediately from memory — no server round-trip (breaks user gesture).
  if (isAndroidDevice()) {
    return [directFile];
  }

  const candidates: File[] = [directFile];
  const bytes = await blob.arrayBuffer();
  candidates.push(buildPdfFileFromBytes(bytes, safeName));

  if (isIosDevice()) {
    try {
      candidates.unshift(await fetchPdfFileViaServer(bytes, safeName));
    } catch {
      // Continue with locally built files.
    }
  }

  return uniqueFiles(candidates);
}

async function sharePdfFile(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  const candidates = await buildShareFileCandidates(blob, fileName);
  const file = orderCandidatesForShare(candidates)[0];
  if (!file) {
    throw new Error("Could not prepare PDF for sharing.");
  }
  // One share call per tap — Android loses user activation after failed retries.
  return tryNativeFileShare(file);
}

/**
 * Phones/tablets: native share sheet with a real PDF file attachment only.
 * Desktop: download the PDF file.
 */
export async function deliverPdfFile(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  if (shouldUseNativeShare()) {
    return sharePdfFile(blob, fileName);
  }

  downloadPdfFile(blob, fileName);
  return "downloaded";
}
