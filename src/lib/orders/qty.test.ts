import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayRemainingQty,
  formatQty,
  openReceiveQty,
  parseDotQty,
  parseQty,
  receiveActualBaseQty,
  receiveLineUnits,
  sanitizeDotDecimal,
  sumDisplayRemaining,
} from "./qty";

test("parseQty accepts comma decimals", () => {
  assert.equal(parseQty("1,5"), 1.5);
  assert.equal(parseQty("1.5"), 1.5);
  assert.equal(formatQty(0), "0");
});

test("Осталось is 0 when the order is placed and nothing arrived", () => {
  const placed = { orderedQty: 1, acceptedQty: 0, postedQty: 0, remainingQty: 1 };
  assert.equal(openReceiveQty(placed), 1);
  assert.equal(displayRemainingQty(placed), 0);
  assert.equal(sumDisplayRemaining([placed]), 0);
});

test("Осталось stays 0 after employee receive with nothing posted", () => {
  const marked = { orderedQty: 10, acceptedQty: 6, postedQty: 0, remainingQty: 4 };
  assert.equal(openReceiveQty(marked), 4);
  assert.equal(displayRemainingQty(marked), 0);
});

test("after admin post, Осталось is ordered minus posted", () => {
  const posted = { orderedQty: 10, acceptedQty: 6, postedQty: 6, remainingQty: 4 };
  assert.equal(displayRemainingQty(posted), 4);
  assert.equal(displayRemainingQty({ orderedQty: 10, acceptedQty: 6, postedQty: 6 }), 4);
});

test("full receive and post leaves Осталось at 0", () => {
  const done = { orderedQty: 1, acceptedQty: 1, postedQty: 1, remainingQty: 0 };
  assert.equal(displayRemainingQty(done), 0);
});

test("closed underdelivery does not show leftover after post", () => {
  const closed = { orderedQty: 10, acceptedQty: 6, postedQty: 6, remainingQty: 0 };
  assert.equal(displayRemainingQty(closed), 0);
});

test("receive other qty accepts a dot and rejects a comma", () => {
  assert.equal(sanitizeDotDecimal("1.5"), "1.5");
  assert.equal(sanitizeDotDecimal("1.2.3"), "1.23");
  assert.equal(parseDotQty("1.5"), 1.5);
  assert.equal(parseDotQty("1,5"), 0);
  assert.equal(parseQty("1,5"), 1.5);
  assert.equal(receiveActualBaseQty({ mode: "as_ordered", remainingQty: 40, actualText: "" }), 40);
  assert.equal(receiveActualBaseQty({ mode: "other", remainingQty: 40, actualText: "35.5" }), 35.5);
  assert.equal(receiveActualBaseQty({ mode: "other", remainingQty: 40, actualText: "35,5" }), 0);
  assert.deepEqual(receiveLineUnits("kg"), ["kg"]);
  assert.deepEqual(receiveLineUnits("l"), ["l"]);
});

test("over-qty receive does not create leftover without a post", () => {
  const over = { orderedQty: 2, acceptedQty: 3, postedQty: 0, remainingQty: 0 };
  assert.equal(displayRemainingQty(over), 0);
  assert.equal(openReceiveQty(over), 0);
});
