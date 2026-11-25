import assert from "node:assert/strict";
import { test } from "node:test";
import { advertisingRateForScenario, channelFinanceIncomplete, splitRateWithVat } from "./channelFinance";

test("Grab preliminary: 18.18% net + 8% VAT → gross ≈ 19.6344%", () => {
  const split = splitRateWithVat(18.18, 8, false);
  assert.ok(split.gross != null);
  assert.ok(Math.abs(split.gross! - 19.6344) < 0.001);
  assert.equal(split.net, 18.18);
});

test("gross rate with VAT included splits back to net", () => {
  const split = splitRateWithVat(19.6344, 8, true);
  assert.ok(split.net != null);
  assert.ok(Math.abs(split.net! - 18.18) < 0.01);
});

test("Shopee incomplete when commission enabled without rate", () => {
  assert.deepEqual(channelFinanceIncomplete({ commission_enabled: true, commission_rate: null, commission_pct: null }), [
    "no_commission",
  ]);
});

test("advertising scenario picks standard gross preset", () => {
  assert.equal(
    advertisingRateForScenario({
      advertising_scenario: "standard",
      advertising_standard_gross_pct: 7,
      advertising_rate: 99,
    }),
    7,
  );
});
