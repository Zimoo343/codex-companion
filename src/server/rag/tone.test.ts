import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAudience, audienceRules, resolveAudience } from "./tone.ts";

test("endgame vocabulary wins over beginner phrasing", () => {
  assert.equal(classifyAudience("new to raiding, what is a good lowman strat?"), "endgame");
  assert.equal(classifyAudience("grandmaster loadout for this week?"), "endgame");
});

test("returning players are not treated as new", () => {
  assert.equal(classifyAudience("returning player, what changed?"), "returning");
  assert.equal(classifyAudience("i came back after a year, what should i farm"), "returning");
});

test("explicit beginner phrasing is recognised", () => {
  assert.equal(classifyAudience("i just started, what should i do first?"), "new");
  assert.equal(classifyAudience("brand new player here"), "new");
});

test("ordinary questions stay neutral", () => {
  assert.equal(classifyAudience("what does bait and switch do"), "unknown");
});

test("history counts when the question itself is neutral", () => {
  assert.equal(resolveAudience("and the armour?", "i am a returning player"), "returning");
});

test("only known audiences add rules", () => {
  assert.equal(audienceRules("unknown"), "");
  assert.match(audienceRules("new"), /no percentages/i);
  assert.match(audienceRules("endgame"), /breakpoints/i);
});

test("a freshly downloaded game counts as new", () => {
  assert.equal(classifyAudience("I just downloaded d2, where do I start"), "new");
  assert.equal(classifyAudience("just installed, what do I do"), "new");
});
