import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("processing stages overlay instead of in-flow details", () => {
  const src = readFileSync(join(here, "losses.tsx"), "utf8");
  const css = readFileSync(join(here, "erp.css"), "utf8");
  assert.equal(src.includes("<details"), false);
  assert.ok(src.includes("erpMethodsDrop"));
  assert.match(css, /\.erpMethodsDrop\s*\{[\s\S]*?position:\s*absolute/);
  assert.doesNotMatch(css, /\.erpMethodsDrop\s*\{[\s\S]*?position:\s*static/);
});
