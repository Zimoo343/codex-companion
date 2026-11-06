import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHeaders, parseSections } from "./sheet-sections.ts";

test("parses stacked tables with section titles", () => {
  const rows = [
    ["Weapon Perks"],
    ["Perk", "Description"],
    ["Rampage", "Increases damage after kills"],
    ["Kill Clip", "Reload after a kill for bonus damage"],
    ["Armor Perks", ""],
    ["Perk", "Description"],
    ["Ashes to Assets", "Gain super energy on grenade kills"],
  ];

  const sections = parseSections(rows);
  assert.equal(sections.length, 2);
  assert.equal(sections[0]?.section, "Weapon Perks");
  assert.equal(sections[0]?.rows.length, 2);
  assert.equal(sections[0]?.rows[0]?.Perk, "Rampage");
  assert.equal(sections[1]?.section, "Armor Perks");
  assert.equal(sections[1]?.rows[0]?.Perk, "Ashes to Assets");
});

test("deduplicates repeated header names", () => {
  assert.deepEqual(normalizeHeaders(["Armor", "Icon", "Armor"]), ["Armor", "Icon", "Armor (2)"]);
});

test("skips rows that are only numbers, keeping headers intact", () => {
  const rows = [["Game Mechanics"], ["Tier", "Walk Speed"], ["3", "5.60"], ["4", "5.80"]];

  const sections = parseSections(rows);
  assert.equal(sections[0]?.headers.join("|"), "Tier|Walk Speed");
  assert.equal(sections[0]?.rows.length, 2);
});

test("ignores empty rows", () => {
  const rows = [["Tab"], ["A", "B"], ["", ""], ["1", "2"]];
  const sections = parseSections(rows);
  assert.equal(sections[0]?.rows.length, 1);
});

test("keeps single-cell section titles from becoming headers", () => {
  const rows = [["Section"], ["Name", "Value"], ["x", "1"]];
  const sections = parseSections(rows);
  assert.equal(sections[0]?.section, "Section");
  assert.equal(sections[0]?.headers[0], "Name");
});
