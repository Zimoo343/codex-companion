import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, usesLegacyStats } from "./stats.ts";

test("detects pre-Edge-of-Fate vocabulary", () => {
  assert.equal(usesLegacyStats("Resilience first for survivability"), true);
  assert.equal(usesLegacyStats("Mobility -> Resilience -> Recovery"), true);
  assert.equal(usesLegacyStats("Grenade -> Weapons -> Super"), false);
});

test("withholds legacy stat lines instead of translating them", () => {
  assert.equal(currentStats("Resilience -> Strength"), "");
  assert.equal(currentStats("Discipline"), "");
});

test("keeps current stat lines", () => {
  assert.equal(currentStats("Grenade -> Weapons -> Super"), "Grenade -> Weapons -> Super");
  assert.equal(currentStats(""), "");
});
