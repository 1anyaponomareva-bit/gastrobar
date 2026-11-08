import assert from "node:assert/strict";
import { test } from "node:test";
import { formatVietnamDate, formatVietnamDateTime, orderStatusInstant } from "./datetime";

test("Vietnam date+time from the UTC ISO the UI used to dump", () => {
  assert.equal(formatVietnamDateTime("2026-11-07T13:40:53.759115+00:00"), "07.11.2026 20:40");
  assert.equal(formatVietnamDateTime("2026-11-07T13:41:38.433805+00:00"), "07.11.2026 20:41");
  assert.equal(formatVietnamDate("2026-11-07T13:40:53.759115+00:00"), "07.11.2026");
});

test("Vietnam clock rolls the calendar date after 17:00 UTC", () => {
  assert.equal(formatVietnamDateTime("2026-11-07T17:30:00.000Z"), "08.11.2026 00:30");
  assert.equal(formatVietnamDate("2026-11-07T17:30:00.000Z"), "08.11.2026");
});

test("date-only strings stay on that calendar day", () => {
  assert.equal(formatVietnamDate("2026-11-09"), "09.11.2026");
  assert.equal(formatVietnamDateTime("2026-11-09"), "09.11.2026");
});

test("empty and junk stay empty", () => {
  assert.equal(formatVietnamDateTime(null), "");
  assert.equal(formatVietnamDateTime(""), "");
  assert.equal(formatVietnamDateTime("nope"), "");
});

test("status chip date is received when received, otherwise ordered", () => {
  assert.equal(
    orderStatusInstant({
      status: "received",
      receivedAt: "2026-11-07T13:41:38.433805+00:00",
      placedAt: "2026-11-07T13:40:53.759115+00:00",
    }),
    "2026-11-07T13:41:38.433805+00:00",
  );
  assert.equal(
    orderStatusInstant({
      status: "ordered",
      receivedAt: null,
      placedAt: "2026-11-07T13:40:53.759115+00:00",
    }),
    "2026-11-07T13:40:53.759115+00:00",
  );
});
