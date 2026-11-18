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

test("mod names are not abilities", async () => {
  const { abilityList } = await import("./builds-blueberries.ts");
  assert.deepEqual(
    abilityList("Gambler's Dodge, Threaded Spike, Heavy Ammo Finder, Heavy Ammo Scout"),
    ["Gambler's Dodge", "Threaded Spike"],
  );
  assert.deepEqual(abilityList("Healing Rift, Arcane Needle, Threadling Grenade"), [
    "Healing Rift",
    "Arcane Needle",
    "Threadling Grenade",
  ]);
});

test("mods keep their slot", async () => {
  const { parseMods } = await import("./builds-blueberries.ts");
  assert.equal(
    parseMods(
      "Helmet : Harmonic Siphon , Heavy Ammo Finder . Arms : Impact Induction . Class Item : 2x Bomber",
    ),
    "helmet: Harmonic Siphon , Heavy Ammo Finder; arms: Impact Induction; class item: 2x Bomber",
  );
  assert.equal(parseMods(""), "");
});

test("keeps a grenade choice but drops the trailing prose", async () => {
  const { abilityList } = await import("./builds-blueberries.ts");
  assert.deepEqual(
    abilityList(
      "Gambler's Dodge and Shackle Grenade or Grapple Grenade . Shackle is better in higher-level content, but Grapple is more fun. ",
    ),
    ["Gambler's Dodge", "Shackle Grenade or Grapple Grenade"],
  );
});

test("aspect and fragment cells lose editorial asides", async () => {
  const { cleanNames } = await import("./builds-blueberries.ts");
  assert.deepEqual(cleanNames("Threaded Spectre + Winter's Shroud or Ascension"), [
    "Threaded Spectre",
    "Winter's Shroud or Ascension",
  ]);
  assert.deepEqual(cleanNames("On Your Mark (to equip 5 Fragments)"), ["On Your Mark"]);
  assert.deepEqual(cleanNames("and either Thread of Isolation or Thread of Binding"), [
    "Thread of Isolation or Thread of Binding",
  ]);
  assert.deepEqual(cleanNames("Consecration is the only required aspect"), ["Consecration"]);
  assert.deepEqual(cleanNames("Widow's Silk and Whirling Maelstrom ."), [
    "Widow's Silk",
    "Whirling Maelstrom",
  ]);
});

test("keeps a build's 'either dodge' advice as both dodges", async () => {
  const { abilityList } = await import("./builds-blueberries.ts");
  assert.deepEqual(abilityList("Either Dodge works ."), ["Gambler’s Dodge or Marksman’s Dodge"]);
});
