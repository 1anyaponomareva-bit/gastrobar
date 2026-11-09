import assert from "node:assert/strict";
import { test } from "node:test";
import { KITCHEN_ORDERS_ACTOR } from "./access";
import { isValidPersonName, needsPlaceActorName, normalizePersonName, personLabel, resolvePlaceDisplayName } from "./person";

test("registration name rejects blanks and emails", () => {
  assert.equal(isValidPersonName("Anya"), true);
  assert.equal(isValidPersonName("  Аня  "), true);
  assert.equal(isValidPersonName("A"), false);
  assert.equal(isValidPersonName("  "), false);
  assert.equal(isValidPersonName("1anyaponomareva@gmail.com"), false);
  assert.equal(isValidPersonName("kitchen"), false);
  assert.equal(isValidPersonName("Kitchen"), false);
});

test("personLabel prefers a real name over an email", () => {
  assert.equal(personLabel("Anya", "1anyaponomareva@gmail.com"), "Anya");
  assert.equal(personLabel(null, "1anyaponomareva@gmail.com"), "1anyaponomareva");
  assert.equal(personLabel(undefined, null), "—");
  assert.equal(personLabel(null, "kitchen@gastrofood"), "—");
  assert.equal(personLabel("kitchen", KITCHEN_ORDERS_ACTOR), "—");
  assert.equal(personLabel("Анна", KITCHEN_ORDERS_ACTOR), "Анна");
});

test("public kitchen place requires a real person name", () => {
  assert.equal(needsPlaceActorName({ public: true, email: KITCHEN_ORDERS_ACTOR, name: null }), true);
  assert.equal(needsPlaceActorName({ public: true, email: KITCHEN_ORDERS_ACTOR, name: "kitchen" }), true);
  assert.equal(needsPlaceActorName({ public: true, email: KITCHEN_ORDERS_ACTOR, name: "Анна" }), false);
  assert.equal(needsPlaceActorName({ public: false, email: "anna@gastrofood", name: "Анна" }), false);
  assert.equal(resolvePlaceDisplayName({ sessionName: null, enteredName: "" }), null);
  assert.equal(resolvePlaceDisplayName({ sessionName: null, enteredName: "kitchen" }), null);
  assert.equal(resolvePlaceDisplayName({ sessionName: "Анна", enteredName: "" }), "Анна");
  assert.equal(resolvePlaceDisplayName({ sessionName: null, enteredName: "  Анна " }), "Анна");
});

test("normalizePersonName collapses spaces", () => {
  assert.equal(normalizePersonName("  Аня   Пономарёва "), "Аня Пономарёва");
});
