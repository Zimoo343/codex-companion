import assert from "node:assert/strict";
import { test } from "node:test";
import { detectIntent } from "./intent.ts";

test("detects weapon families", () => {
  assert.deepEqual(detectIntent("what is the best rocket launcher").families, ["Rockets"]);
  assert.deepEqual(detectIntent("best lmg for boss damage").families, ["LMGs"]);
  assert.deepEqual(detectIntent("which linear fusion should I use").families, ["LFRs"]);
});

test("prefers the longer family keyword", () => {
  assert.ok(detectIntent("best rocket sidearm").families.includes("Rocket Sidearms"));
  assert.ok(!detectIntent("best rocket sidearm").families.includes("Rockets"));
});

test("flags damage, armor, activity and subclass questions", () => {
  const damage = detectIntent("what is the best dps heavy weapon");
  assert.equal(damage.wantsDamage, true);

  const armor = detectIntent("which exotic helmet helps a hunter survive");
  assert.equal(armor.wantsArmor, true);

  const activity = detectIntent("how does the dungeon work");
  assert.equal(activity.wantsActivity, true);

  const subclass = detectIntent("what does this fragment do");
  assert.equal(subclass.wantsSubclass, true);
});

test("builds short phrases for entity lookup and drops filler words", () => {
  const intent = detectIntent("what is the best rocket on heavy slot");
  assert.ok(intent.phrases.some((phrase) => phrase.includes("heavy")));
  assert.ok(!intent.phrases.includes("what"));
  assert.ok(intent.phrases.length <= 8);
});

test("does not invent flags for neutral questions", () => {
  const intent = detectIntent("tell me about the tower");
  assert.equal(intent.wantsDamage, false);
  assert.equal(intent.wantsArmor, false);
});
