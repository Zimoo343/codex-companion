import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeAnswer } from "./answer-text.ts";

test("removes references to the user's input", () => {
  assert.equal(
    sanitizeAnswer("the best profile from the data you gave is Rapid-Fire."),
    "the best profile according to the community sources is Rapid-Fire.",
  );
  assert.equal(
    sanitizeAnswer("Your data shows it is S tier."),
    "the community data shows it is S tier.",
  );
  assert.equal(sanitizeAnswer("the provided data lists it"), "the sources lists it");
  assert.equal(sanitizeAnswer("it is not in this set"), "it is not in the sources");
});

test("leaves normal answers untouched", () => {
  const text = "According to AegisRelic, Hezen Vengeance is S tier and drops from Vault of Glass.";
  assert.equal(sanitizeAnswer(text), text);
});
