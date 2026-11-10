import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStatLine, usesLegacyStats } from "./stats.ts";

test("detects pre-Edge-of-Fate vocabulary", () => {
  assert.equal(usesLegacyStats("Max Resilience."), true);
  assert.equal(usesLegacyStats("Melee -> Grenade -> Super"), false);
});

test("refuses to translate legacy lines into current priorities", () => {
  assert.equal(currentStatLine("Max Resilience."), "");
  assert.equal(currentStatLine("Discipline then Intellect"), "");
});

test("passes current stat lines through", () => {
  assert.equal(currentStatLine("Melee → Grenade → Super"), "Melee → Grenade → Super");
  assert.equal(currentStatLine(""), "");
});
