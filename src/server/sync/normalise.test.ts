import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapseActivities,
  dedupeWeapons,
  isImportableActivity,
  normalizeActivityName,
  slugColumn,
  toIntegerOrNull,
  type WeaponRow,
} from "./normalise.ts";

const weapon = (name: string, hash: string, perks: string[]): WeaponRow => ({
  hash,
  name,
  type: "Grenade Launcher",
  tier: "Legendary",
  damageType: "Void",
  frame: "Adaptive Grenade Launcher",
  ammoType: "Heavy",
  stats: {},
  perks,
});

test("collapses difficulty variants of one activity", () => {
  assert.equal(normalizeActivityName("Duality: Standard"), "Duality");
  assert.equal(normalizeActivityName("Duality: Master"), "Duality");
  assert.equal(normalizeActivityName("Vault of Glass"), "Vault of Glass");
});

test("drops featured and empty activity names", () => {
  assert.equal(isImportableActivity("Featured Encore: Morgeth: The Pantheon"), false);
  assert.equal(isImportableActivity("Equilibrium: Standard"), true);
});

test("collapses activity rows and counts variants", () => {
  const collapsed = collapseActivities([
    {
      name: "Duality: Standard",
      type: "Dungeon",
      place: "Leviathan",
      destination: "Derelict Leviathan",
      lightLevel: 1550,
      isPvp: false,
    },
    {
      name: "Duality: Master",
      type: "Dungeon",
      place: "Leviathan",
      destination: "Derelict Leviathan",
      lightLevel: 0,
      isPvp: false,
    },
    {
      name: "Story Mission",
      type: "Story",
      place: "",
      destination: "",
      lightLevel: 0,
      isPvp: false,
    },
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.name, "Duality");
  assert.equal(collapsed[0]?.variants, 2);
});

test("keeps the weapon with the widest perk list", () => {
  const deduped = dedupeWeapons([
    weapon("Edge Transit", "1", ["A"]),
    weapon("Edge Transit", "2", ["A", "B", "C"]),
    weapon("Edge Transit", "3", ["A", "B"]),
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.hash, "2");
});

test("keeps same-named weapons from different frames apart only by name", () => {
  const deduped = dedupeWeapons([weapon("Fatebringer", "1", ["A"]), weapon("Other", "2", [])]);
  assert.equal(deduped.length, 2);
});

test("slugifies sheet headers", () => {
  assert.equal(slugColumn("WEAPON 🖼️", 0), "weapon");
  assert.equal(slugColumn("VALUES base\nDamage", 7), "base_damage");
  assert.equal(slugColumn("CALCULATIONS 1mag MDPS", 23), "1mag_mdps");
  assert.equal(slugColumn("", 4), "col_4");
});

test("parses numbers and rejects junk", () => {
  assert.equal(toIntegerOrNull("1,745"), 1745);
  assert.equal(toIntegerOrNull("1306"), 1306);
  assert.equal(toIntegerOrNull(""), null);
  assert.equal(toIntegerOrNull("N/A"), null);
  assert.equal(toIntegerOrNull(undefined), null);
});
