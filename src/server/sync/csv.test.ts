import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "./csv.ts";

test("splits plain rows", () => {
  assert.deepEqual(parseCsv('"a","b"\n"1","2"\n'), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("keeps commas inside quoted cells", () => {
  assert.deepEqual(parseCsv('"name","perks"\n"Edge Transit","Cascade Point, Bait and Switch"'), [
    ["name", "perks"],
    ["Edge Transit", "Cascade Point, Bait and Switch"],
  ]);
});

test("keeps line breaks inside quoted cells", () => {
  const csv = '"name","perk1"\n"Edge Transit","Cascade Point\nEnvious Arsenal"';
  assert.deepEqual(parseCsv(csv), [
    ["name", "perk1"],
    ["Edge Transit", "Cascade Point\nEnvious Arsenal"],
  ]);
});

test("unescapes doubled quotes", () => {
  assert.deepEqual(parseCsv('"a"\n"say ""hi"""'), [["a"], ['say "hi"']]);
});

test("drops blank rows", () => {
  assert.deepEqual(parseCsv('"a"\n\n"b"\n'), [["a"], ["b"]]);
});

test("handles windows line endings", () => {
  assert.deepEqual(parseCsv('"a","b"\r\n"1","2"\r\n'), [
    ["a", "b"],
    ["1", "2"],
  ]);
});
