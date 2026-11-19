import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  beginShareThenPersist,
  choosePdfDelivery,
  downloadPdfFile,
  interpretShareError,
} from "./deliverPdfFile";

const here = dirname(fileURLToPath(import.meta.url));

test("desktop without Web Share downloads instead of sharing", () => {
  assert.equal(
    choosePdfDelivery({ hasShare: false, canShareFiles: null, mobileOrTouch: false }),
    "download",
  );
});

test("share exists but canShare files is false (desktop Chrome) downloads", () => {
  assert.equal(
    choosePdfDelivery({ hasShare: true, canShareFiles: false, mobileOrTouch: false }),
    "download",
  );
});

test("phones with Web Share + files open the share sheet", () => {
  assert.equal(
    choosePdfDelivery({ hasShare: true, canShareFiles: true, mobileOrTouch: true }),
    "share",
  );
});

test("old Android without canShare still shares on a phone", () => {
  assert.equal(
    choosePdfDelivery({ hasShare: true, canShareFiles: null, mobileOrTouch: true }),
    "share",
  );
});

test("desktop with share but no canShare API downloads", () => {
  assert.equal(
    choosePdfDelivery({ hasShare: true, canShareFiles: null, mobileOrTouch: false }),
    "download",
  );
});

test("Windows desktop with Web Share + files downloads, never native share", () => {
  assert.equal(
    choosePdfDelivery({ hasShare: true, canShareFiles: true, mobileOrTouch: false }),
    "download",
  );
});

test("downloadPdfFile clicks <a download> blob and never navigator.share", () => {
  const src = readFileSync(join(here, "deliverPdfFile.ts"), "utf8");
  const start = src.indexOf("export function downloadPdfFile");
  const end = src.indexOf("function readCanShareFiles");
  const fn = src.slice(start, end);
  assert.match(fn, /anchor\.download/);
  assert.match(fn, /createObjectURL/);
  assert.doesNotMatch(fn, /navigator\.share/);
  assert.doesNotMatch(fn, /choosePdfDelivery/);

  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const origSetTimeout = globalThis.setTimeout;
  const clicks: Array<{ href: string; download: string }> = [];
  const anchor = {
    href: "",
    download: "",
    rel: "",
    style: { display: "" },
    click() {
      clicks.push({ href: this.href, download: this.download });
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, "a");
        return anchor;
      },
      body: { appendChild() {}, removeChild() {} },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout: () => 0 },
  });
  URL.createObjectURL = () => "blob:prep-pdf";
  URL.revokeObjectURL = () => undefined;
  globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout;

  try {
    downloadPdfFile(new Blob(["%PDF"], { type: "application/pdf" }), "tech-card.pdf");
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0]?.href, "blob:prep-pdf");
    assert.equal(clicks[0]?.download, "tech-card.pdf");
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    globalThis.setTimeout = origSetTimeout;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("PrepsPage Save PDF uses downloadPdfFile and never deliverPdfFile or navigator.share", () => {
  const src = readFileSync(join(here, "../components/erp/PrepsPage.tsx"), "utf8");
  assert.match(src, /\bdownloadPdfFile\s*\(/);
  assert.doesNotMatch(src, /\bdeliverPdfFile\s*\(/);
  assert.doesNotMatch(src, /navigator\.share/);
});

test("user cancelling the share sheet is not a download", () => {
  assert.equal(interpretShareError({ name: "AbortError" }), "cancelled");
  assert.equal(interpretShareError(Object.assign(new Error("AbortError"), { name: "AbortError" })), "cancelled");
});

test("lost user gesture (NotAllowedError) is failed, not a download fallback", () => {
  assert.equal(interpretShareError({ name: "NotAllowedError" }), "failed");
  assert.equal(interpretShareError({ name: "TypeError" }), "failed");
  assert.equal(interpretShareError(new Error("share failed")), "failed");
});

test("beginShareThenPersist starts share without waiting for persist", async () => {
  const events: string[] = [];
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });

  const resultPromise = beginShareThenPersist(
    async () => {
      events.push("share");
      return "shared" as const;
    },
    async () => {
      events.push("save-start");
      await saveGate;
      events.push("save-done");
    },
  );

  await Promise.resolve();
  assert.equal(events.includes("share"), true);
  assert.equal(events.includes("save-start"), true);
  assert.equal(events.includes("save-done"), false);
  assert.equal(events[0], "share");

  const result = await resultPromise;
  assert.equal(result, "shared");
  assert.equal(events.includes("save-done"), false);

  releaseSave();
  await saveGate;
  await Promise.resolve();
  assert.equal(events.includes("save-done"), true);
});
