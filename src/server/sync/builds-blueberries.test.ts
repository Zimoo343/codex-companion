import assert from "node:assert/strict";
import { test } from "node:test";

// The stat cell runs into the next labelled block on older pages.
function cleanStats(value: string): string {
  const trimmed = value
    .split(/Armor Bonus|Mods\s*:/i)[0]!
    .replace(/[\s.&,;:-]+$/, "")
    .trim();
  return /\b(health|melee|grenade|super|class|weapons|resilience|mobility|recovery|discipline|intellect|strength)\b/i.test(
    trimmed,
  )
    ? trimmed
    : "";
}

test("keeps full stat names when trimming the tail", () => {
  assert.equal(cleanStats("Weapons → Super → Class. Armor Bonus Set &"), "Weapons → Super → Class");
  assert.equal(cleanStats("Max Resilience. Armor Bonus Set &"), "Max Resilience");
  assert.equal(cleanStats("Weapons → Super → Class."), "Weapons → Super → Class");
});

test("drops cells with no stat names", () => {
  assert.equal(cleanStats("Brawler. Armor Bonus Set &"), "");
});
