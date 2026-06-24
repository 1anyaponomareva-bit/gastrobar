export type DeliverPdfResult = "shared" | "downloaded" | "cancelled";

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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

async function sharePdfFile(
  blob: Blob,
  fileName: string,
  shareTitle?: string,
): Promise<DeliverPdfResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    throw new Error("File sharing is not supported in this browser.");
  }

  const file = new File([await blob.arrayBuffer()], fileName, {
    type: "application/pdf",
  });

  const shareData: ShareData = {
    files: [file],
    title: shareTitle ?? fileName,
  };

  if (
    typeof navigator.canShare === "function" &&
    !navigator.canShare(shareData) &&
    !isIosDevice()
  ) {
    throw new Error("This browser cannot share PDF files.");
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

/**
 * Mobile/tablet: native share sheet with a real PDF file (not a blob URL).
 * Desktop: download the PDF file.
 */
export async function deliverPdfFile(
  blob: Blob,
  fileName: string,
  shareTitle?: string,
): Promise<DeliverPdfResult> {
  if (isMobileDevice()) {
    return sharePdfFile(blob, fileName, shareTitle);
  }

  downloadPdfFile(blob, fileName);
  return "downloaded";
}
