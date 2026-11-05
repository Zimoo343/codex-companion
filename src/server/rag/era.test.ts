import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEra } from "./era.ts";

test("detects destiny 1 wording", () => {
  assert.equal(classifyEra("In Rise of Iron you forged your own Gjallarhorn."), "d1");
  assert.equal(classifyEra("This Year 1 weapon was sold by Xur."), "d1");
});

test("detects destiny 2 wording", () => {
  assert.equal(classifyEra("Season of the Wish added this activity."), "d2");
  assert.equal(classifyEra("Guardians earn this from the Artifact."), "d2");
});

test("marks mixed text as both", () => {
  assert.equal(classifyEra("Gjallarhorn returned in Destiny 2 after Rise of Iron."), "both");
});

test("leaves neutral text unknown", () => {
  assert.equal(classifyEra("This weapon deals void damage."), "unknown");
});
