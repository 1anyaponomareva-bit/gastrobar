import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidPersonName, normalizePersonName, personLabel } from "./person";

test("registration name rejects blanks and emails", () => {
  assert.equal(isValidPersonName("Anya"), true);
  assert.equal(isValidPersonName("  Аня  "), true);
  assert.equal(isValidPersonName("A"), false);
  assert.equal(isValidPersonName("  "), false);
  assert.equal(isValidPersonName("1anyaponomareva@gmail.com"), false);
});

test("personLabel prefers a real name over an email", () => {
  assert.equal(personLabel("Anya", "1anyaponomareva@gmail.com"), "Anya");
  assert.equal(personLabel(null, "1anyaponomareva@gmail.com"), "1anyaponomareva");
  assert.equal(personLabel(undefined, null), "—");
});

test("normalizePersonName collapses spaces", () => {
  assert.equal(normalizePersonName("  Аня   Пономарёва "), "Аня Пономарёва");
});
