export type DeliverPdfResult = "shared" | "downloaded" | "cancelled";

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildPdfFile(bytes: ArrayBuffer, fileName: string): File {
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

async function tryNativeFileShare(file: File): Promise<DeliverPdfResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    throw new Error("File sharing is not supported in this browser.");
  }

  // iOS shares a page URL instead of the file when title/text/url are included.
  const shareData: ShareData = { files: [file] };

  if (typeof navigator.canShare === "function" && !navigator.canShare(shareData)) {
    if (!isIosDevice()) {
      throw new Error("This browser cannot share PDF files.");
    }
  }

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

  const roundTrip = await response.arrayBuffer();
  return buildPdfFile(roundTrip, fileName);
}

async function sharePdfFile(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  const bytes = await blob.arrayBuffer();
  const directFile = buildPdfFile(bytes, fileName);

  try {
    return await tryNativeFileShare(directFile);
  } catch (firstError) {
    if (
      firstError instanceof DOMException &&
      firstError.name === "AbortError"
    ) {
      return "cancelled";
    }

    const serverFile = await fetchPdfFileViaServer(bytes, fileName);
    return tryNativeFileShare(serverFile);
  }
}

/**
 * Mobile/tablet: native share sheet with a real PDF file attachment only.
 * Desktop: download the PDF file.
 */
export async function deliverPdfFile(
  blob: Blob,
  fileName: string,
): Promise<DeliverPdfResult> {
  if (isMobileDevice()) {
    return sharePdfFile(blob, fileName);
  }

  downloadPdfFile(blob, fileName);
  return "downloaded";
}
