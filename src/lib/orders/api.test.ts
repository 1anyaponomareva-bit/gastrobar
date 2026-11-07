import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_SAVE_METHOD, errorMessage, isOrdersNetworkError, OrdersApiError } from "./api";

test("draft save uses POST so public /orders does not depend on PUT", () => {
  assert.equal(DRAFT_SAVE_METHOD, "POST");
});

test("error mapping does not call network errors 500s", () => {
  const offline = "Нет связи с сервером. Проверьте интернет и повторите.";
  const saveFailed = "Не удалось сохранить. Введённое количество на месте.";
  assert.equal(errorMessage(new OrdersApiError(500, "server"), offline, saveFailed), saveFailed);
  assert.equal(errorMessage(new OrdersApiError(500, "server", "db boom"), offline, saveFailed), "db boom");
  assert.equal(errorMessage(new OrdersApiError(403, "ERP_FORBIDDEN", "actor"), offline, saveFailed), "actor");
  assert.equal(errorMessage(new OrdersApiError(401, "auth"), offline, saveFailed), "auth");
  assert.equal(errorMessage(new OrdersApiError(405, "HTTP 405", "HTTP 405"), offline, saveFailed), "HTTP 405");
  assert.equal(isOrdersNetworkError(new OrdersApiError(500, "server")), false);
  assert.equal(isOrdersNetworkError(new OrdersApiError(403, "ERP_FORBIDDEN")), false);
});

test("error mapping says offline only for genuine fetch TypeError", () => {
  const offline = "offline";
  const generic = "generic";
  assert.equal(errorMessage(new OrdersApiError(0, "network", "Failed to fetch"), offline, generic), offline);
  assert.equal(errorMessage(new TypeError("Failed to fetch"), offline, generic), offline);
  assert.equal(isOrdersNetworkError(new TypeError("Failed to fetch")), true);
  const abort = new OrdersApiError(0, "aborted");
  assert.equal(errorMessage(abort, offline, generic), generic);
  assert.equal(isOrdersNetworkError(abort), false);
  const abortedDom = Object.assign(new Error("The user aborted a request."), { name: "AbortError" });
  assert.equal(isOrdersNetworkError(abortedDom), false);
  assert.equal(errorMessage(abortedDom, offline, generic), generic);
});
