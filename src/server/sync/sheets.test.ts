import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAegisArchetypes, buildAegisWeapons } from "./sheets.ts";

const weaponHeader = [
  "WEAPON 🖼️",
  "Name",
  "INFO Season",
  "Energy",
  "Frame",
  "Source",
  "Stun",
  "Ammo",
  "⬆️",
  "PERKS Barrel",
  "Mag",
  "MW",
  "Perk 1",
  "Perk 2",
  "Origin Trait",
  "ANALYSIS Notes",
  "#",
  "Tier",
];

test("maps aegis weapon columns by header name", () => {
  const rows = [
    weaponHeader,
    [
      "",
      "Hezen Vengeance",
      "29",
      "Solar",
      "Aggressive",
      "Vault of Glass",
      "",
      "50",
      "Yes",
      "Quick Launch",
      "Impact Casing",
      "Handling",
      "Cluster Bomb",
      "Bipod",
      "Origin",
      "best rocket",
      "1",
      "S",
    ],
  ];

  const [weapon] = buildAegisWeapons("Rockets", rows);
  assert.equal(weapon?.name, "Hezen Vengeance");
  assert.equal(weapon?.tab, "Rockets");
  assert.equal(weapon?.energy, "Solar");
  assert.equal(weapon?.source, "Vault of Glass");
  assert.equal(weapon?.perk1, "Cluster Bomb");
  assert.equal(weapon?.tier, "S");
});

test("skips rows without a name", () => {
  const rows = [weaponHeader, ["", "", "29", "Solar"]];
  assert.deepEqual(buildAegisWeapons("Rockets", rows), []);
});

test("fails loudly when the name column disappears", () => {
  assert.throws(
    () =>
      buildAegisWeapons("Rockets", [
        ["Weapon", "Tier"],
        ["x", "S"],
      ]),
    /no name column/,
  );
});

test("extracts damage columns from the archetypes tab", () => {
  const rows = [
    [
      "ARCHETYPE Icon",
      "",
      "Weapon",
      "Frame",
      "Stun",
      "modded Mag%",
      "Ammo",
      "VALUES base Damage",
      "minor Scalar",
      "elite Scalar",
      "crit Multi",
      "max Ammo",
      "base Interval",
      "optimized Interval",
      "true RPM",
      "tested Mag",
      "base Reload",
      "",
      "base Dump",
      "modded Mag",
      "modded Reload",
      "modded Dump",
      "max Brick",
      "CALCULATIONS 1mag MDPS",
      "max MDPS",
      "Luna MDPS",
      "typical MDPS",
      "body MDPS",
      "typical EDPS",
      "add Score",
      "1mag BDPS",
      "max BDPS",
      "boss Score",
      "Luna BDPS",
      "typical BDPS",
      "minor Total",
      "boss Total",
      "minor Brick",
      "boss Brick",
      "ADS falloff Range",
      "ANALYSIS Notes",
      "Tier",
    ],
    [
      "",
      "",
      "Linear fusion rifle",
      "Precision",
      "",
      "26.83%",
      "Power",
      "27.574",
      "2.56",
      "1.92",
      "1.755",
      "",
      "0.100",
      "N/A",
      "600",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "1609",
      "1284",
      "1100",
      "990",
      "800",
      "900",
      "",
      "1240",
      "1284",
      "",
      "1100",
      "990",
      "",
      "36427",
      "",
      "",
      "50",
      "good",
      "B",
    ],
  ];

  const [row] = buildAegisArchetypes(rows);
  assert.equal(row?.weapon, "Linear fusion rifle");
  assert.equal(row?.frame, "Precision");
  assert.equal(row?.ammo, "Power");
  assert.equal(row?.oneMagBdps, 1240);
  assert.equal(row?.maxBdps, 1284);
  assert.equal(row?.typicalBdps, 990);
  assert.equal(row?.tier, "B");
  assert.equal(row?.row["base_damage"], "27.574");
});
