import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { parseCsv } from "./csv.ts";

const SHEET_ID = "1-pvCrjb9QLEwvQn0YquCxvZzMh25gMIh4ZrNe1DdAsY";
const SOURCE = "AegisRelic class items";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
const CLASSES = ["Warlock", "Hunter", "Titan"];

async function fetchTab(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${tab} failed: ${response.status}`);
  return parseCsv(await response.text());
}

// The checklist repeats one 4-column block per class: Trait One, Trait Two, Have it?, Got it on...
export function parseChecklist(
  rows: string[][],
): Array<{ class: string; traitOne: string; traitTwo: string }> {
  const combos: Array<{ class: string; traitOne: string; traitTwo: string }> = [];

  for (const row of rows.slice(2)) {
    for (const [index, className] of CLASSES.entries()) {
      const offset = index * 4;
      const traitOne = (row[offset] ?? "").trim();
      const traitTwo = (row[offset + 1] ?? "").trim();
      if (!/^spirit of/i.test(traitOne) || !/^spirit of/i.test(traitTwo)) continue;
      combos.push({ class: className, traitOne, traitTwo });
    }
  }

  return combos;
}

type BuildRow = {
  class: string;
  rank: number;
  exoticCombo: string;
  super: string;
  abilities: string;
  aspects: string;
  fragments: string;
};

// Builds are laid out as three blocks of eleven columns, one block per build, under a
// "X Builds" heading.
export function parseBuilds(rows: string[][]): BuildRow[] {
  const builds: BuildRow[] = [];
  let currentClass = "";

  const valueAfter = (row: string[], start: number, span = 6) =>
    row
      .slice(start + 1, start + 1 + span)
      .map((cell) => cell.trim())
      .filter(Boolean);

  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    const classHeading = /^(warlock|hunter|titan) builds$/i.exec(first);
    if (classHeading) {
      currentClass = classHeading[1]!.replace(/^./, (c) => c.toUpperCase());
      continue;
    }
    if (!currentClass) continue;

    for (const [block, offset] of [0, 11, 22].entries()) {
      const label = (row[offset] ?? "").trim();
      if (!/^build \d/i.test(label)) continue;

      // Rows are stacked vertically, so collect by scanning forward from the label is
      // unnecessary: each row is one field, and the build number comes from the label.
      const rank = Number(label.replace(/\D+/g, "")) || block + 1;
      builds.push({
        class: currentClass,
        rank,
        exoticCombo: "",
        super: "",
        abilities: "",
        aspects: "",
        fragments: "",
      });
    }
  }

  // Second pass: fill fields by matching row labels against the build blocks.
  for (const row of rows) {
    const classHeading = /^(warlock|hunter|titan) builds$/i.exec((row[0] ?? "").trim());
    if (classHeading) {
      currentClass = classHeading[1]!.replace(/^./, (c) => c.toUpperCase());
      continue;
    }
    if (!currentClass) continue;

    for (const [block, offset] of [0, 11, 22].entries()) {
      const target = builds.find(
        (build) => build.class === currentClass && build.rank === block + 1,
      );
      if (!target) continue;

      // Labels live in the first column of a block; values follow in the same row.
      const label = (row[offset] ?? "").trim().toLowerCase();
      const values = valueAfter(row, offset + 1 === offset ? offset : offset + 1);
      if (!label) {
        // Continuation rows: fragments stack vertically, so append them.
        if (values.length > 0 && target.fragments && /^facet of/i.test(values[0] ?? "")) {
          target.fragments = `${target.fragments}, ${values.join(", ")}`;
        }
        continue;
      }
      if (label.startsWith("recommended exotic combo")) {
        target.exoticCombo = values.slice(0, 2).join(" + ");
      } else if (label.startsWith("recommended super")) {
        target.super = values[0] ?? "";
      } else if (label.startsWith("recommended abilities")) {
        target.abilities = values.join(", ");
      } else if (label.startsWith("recommended aspects")) {
        target.aspects = values.join(", ");
      } else if (label.startsWith("recommended fragments")) {
        target.fragments = values.join(", ");
      } else if (/^(melee ability|grenade|class ability)/.test(label)) {
        target.abilities = [target.abilities, ...values].filter(Boolean).join(", ");
      }
    }
  }

  return builds.filter((build) => build.exoticCombo.length > 0);
}

export async function ingestClassItemSheet() {
  const { db, pool } = createDatabase();

  const combos = parseChecklist(await fetchTab("Checklist"));
  const builds = parseBuilds(await fetchTab("Recommended Builds"));

  await db.transaction(async (tx) => {
    await tx.delete(schema.classItemCombos);
    await tx.delete(schema.builds);

    for (let index = 0; index < combos.length; index += 200) {
      await tx
        .insert(schema.classItemCombos)
        .values(combos.slice(index, index + 200).map((combo) => ({ ...combo, source: SOURCE })))
        .onConflictDoNothing();
    }

    if (builds.length > 0) {
      await tx.insert(schema.builds).values(builds.map((build) => ({ ...build, source: SOURCE })));
    }

    await tx
      .insert(schema.sources)
      .values({
        name: SOURCE,
        url: SHEET_URL,
        credit: "TheAegisRelic",
        licenseNote: "Community work. Credited and linked, never re-hosted.",
      })
      .onConflictDoNothing();
  });

  await pool.end();
  return { combos: combos.length, builds: builds.length };
}
