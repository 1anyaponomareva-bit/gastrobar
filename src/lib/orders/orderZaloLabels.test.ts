import assert from "node:assert/strict";
import { test } from "node:test";
import { ordersT } from "./i18n";

test("order Zalo control is labelled Zalo in every language, Open in RU/EN and Mở in VN", () => {
  assert.equal(ordersT("ru", "open_zalo"), "Zalo");
  assert.equal(ordersT("en", "open_zalo"), "Zalo");
  assert.equal(ordersT("vn", "open_zalo"), "Zalo");
  assert.equal(ordersT("ru", "open_half"), "Open");
  assert.equal(ordersT("en", "open_half"), "Open");
  assert.equal(ordersT("vn", "open_half"), "Mở");
});
