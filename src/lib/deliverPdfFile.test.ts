import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginShareThenPersist,
  choosePdfDelivery,
  interpretShareError,
} from "./deliverPdfFile";

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
