import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatStorageOptionLine,
  parseStorageOptions,
  serializeStorageOptions,
  storageOptionIcon,
} from "./storageOptions";

test("keeps a single legacy row as plain columns", () => {
  assert.deepEqual(serializeStorageOptions([{ conditions: "0…4 °C", days: 3 }]), {
    shelf_life_days: 3,
    storage_conditions: "0…4 °C",
  });
  assert.deepEqual(parseStorageOptions("0…4 °C", 3), [{ conditions: "0…4 °C", days: 3 }]);
});

test("stores multiple rows as JSON and picks the shortest days", () => {
  const payload = serializeStorageOptions([
    { conditions: "0…4 °C", days: null },
    { conditions: "−10 °C", days: 15 },
    { conditions: "−18 °C", days: 30 },
  ]);
  assert.equal(payload.shelf_life_days, 15);
  assert.deepEqual(JSON.parse(payload.storage_conditions), {
    v: 1,
    items: [
      { conditions: "0…4 °C", days: null },
      { conditions: "−10 °C", days: 15 },
      { conditions: "−18 °C", days: 30 },
    ],
  });
  assert.deepEqual(parseStorageOptions(payload.storage_conditions, payload.shelf_life_days), [
    { conditions: "0…4 °C", days: null },
    { conditions: "−10 °C", days: 15 },
    { conditions: "−18 °C", days: 30 },
  ]);
});

test("formats lines and picks freezer icon for cold temps", () => {
  assert.equal(formatStorageOptionLine({ conditions: "−10 °C", days: 15 }, "days"), "−10 °C · 15 days");
  assert.equal(storageOptionIcon("−10 °C"), "freezer");
  assert.equal(storageOptionIcon("0…4 °C"), "fridge");
});
