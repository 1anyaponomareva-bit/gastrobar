export type DeliverPdfResult = "shared" | "downloaded" | "cancelled";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ often reports as Mac in Safari and home-screen PWAs.
  return /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
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

/** True when the browser can attach a PDF file to the native share sheet. */
function canSharePdfFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof navigator.canShare !== "function") {
    // Older iOS Safari: no canShare API, but file share usually works.
    return isIosDevice();
  }
  try {
    const probe = new File(["%PDF-1.4\n"], "probe.pdf", {
      type: "application/pdf",
      lastModified: Date.now(),
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function buildPdfFileFromBlob(blob: Blob, fileName: string): File {
  return new File([blob], fileName, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

function buildPdfFileFromBytes(bytes: ArrayBuffer, fileName: string): File {
  return new File([bytes], fileName, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

function downloadPdfFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** iOS/iPadOS: <a download> is ignored — open PDF so user can share from viewer. */
function openPdfInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    downloadPdfFile(blob, "export.pdf");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function deliverPdfFallback(blob: Blob, fileName: string): DeliverPdfResult {
  if (isIosDevice()) {
    openPdfInNewTab(blob);
  } else {
    downloadPdfFile(blob, fileName);
  }
  return "downloaded";
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
      "X-File-Name": encodeURIComponent(fileName),
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

async function buildShareFileCandidates(
  blob: Blob,
  fileName: string,
): Promise<File[]> {
  const candidates: File[] = [buildPdfFileFromBlob(blob, fileName)];
  const bytes = await blob.arrayBuffer();
  candidates.push(buildPdfFileFromBytes(bytes, fileName));

  if (shouldUseNativeShare()) {
    try {
      candidates.push(await fetchPdfFileViaServer(bytes, fileName));
    } catch {
      // Continue with locally built files.
    }
  }

  return uniqueFiles(candidates);
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

async function shareFileCandidates(
  candidates: File[],
): Promise<DeliverPdfResult> {
  const ordered = orderCandidatesForShare(candidates);
  let lastError: unknown;

  for (const file of ordered) {
    try {
      return await tryNativeFileShare(file);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error("Could not share the PDF file.");
}

async function sharePdfFile(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  const candidates = await buildShareFileCandidates(blob, fileName);
  return shareFileCandidates(candidates);
}

/**
 * Phones/tablets: native share sheet with a real PDF file attachment.
 * If file share is unavailable (common on Android tablets in Chrome), save/open PDF instead.
 * Desktop: download the PDF file.
 */
export async function deliverPdfFile(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  if (shouldUseNativeShare()) {
    if (canSharePdfFiles()) {
      try {
        return await sharePdfFile(blob, fileName);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "cancelled";
        }
        console.warn("Native PDF share failed, using fallback:", error);
      }
    }
    return deliverPdfFallback(blob, fileName);
  }

  downloadPdfFile(blob, fileName);
  return "downloaded";
}
