import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { parseCsv } from "./csv.ts";

const SHEET_ID = "1-pvCrjb9QLEwvQn0YquCxvZzMh25gMIh4ZrNe1DdAsY";
const SOURCE = "AegisRelic class items";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
const CLASSES = ["Warlock", "Hunter", "Titan"];

// Each build block is 11 columns wide; the label sits in the first 4 cells and the
// values start 4 columns after the block start.
const BLOCKS = [0, 11, 22];

async function fetchTab(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${tab} failed: ${response.status}`);
  return parseCsv(await response.text());
}

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

type Build = {
  class: string;
  rank: number;
  exoticCombo: string;
  super: string;
  abilities: string;
  aspects: string;
  fragments: string;
};

// A block owns 11 columns. The label is the first non-empty cell in the first five,
// and everything non-empty after it (inside the block) belongs to that label.
function readBlock(row: string[], offset: number): { label: string; values: string[] } {
  const block = row.slice(offset, offset + 10).map((cell) => cell.trim());
  const labelIndex = block.findIndex((cell) => cell.length > 0);
  if (labelIndex === -1) return { label: "", values: [] };

  const values = block
    .slice(labelIndex + 1)
    .filter((cell) => cell.length > 0 && !/^or$/i.test(cell) && !/^recommended /i.test(cell));

  return { label: block[labelIndex]!.toLowerCase().replace(/:$/, ""), values };
}

export function parseBuilds(rows: string[][]): Build[] {
  const builds = new Map<string, Build>();
  let currentClass = "";
  let currentField: keyof Omit<Build, "class" | "rank"> | null = null;

  const slot = (rank: number) => {
    const key = `${currentClass}-${rank}`;
    let build = builds.get(key);
    if (!build) {
      build = {
        class: currentClass,
        rank,
        exoticCombo: "",
        super: "",
        abilities: "",
        aspects: "",
        fragments: "",
      };
      builds.set(key, build);
    }
    return build;
  };

  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    const heading = /^(warlock|hunter|titan) builds$/i.exec(first);
    if (heading) {
      currentClass = heading[1]!.replace(/^./, (character) => character.toUpperCase());
      currentField = null;
      continue;
    }
    if (!currentClass) continue;

    for (const [block, offset] of BLOCKS.entries()) {
      const rank = block + 1;
      const { label, values } = readBlock(row, offset);

      // Continuation rows have no label: the first cell is already a fragment name.
      if (/^facet of/i.test(label)) {
        const build = slot(rank);
        const normalise = (value: string) =>
          value
            .replace(/^facet of\s+/i, "Facet of ")
            .replace(/\b([a-z])([a-z]*)/gi, (_, first: string, rest: string) =>
              /^of$/i.test(first + rest) ? "of" : first.toUpperCase() + rest.toLowerCase(),
            );
        const extra = [label, ...values].filter((value) => /^facet of/i.test(value)).map(normalise);
        build.fragments = [build.fragments, ...extra].filter(Boolean).join(", ");
        currentField = "fragments";
        continue;
      }

      if (label.startsWith("recommended exotic combo")) {
        slot(rank).exoticCombo = values.slice(0, 2).join(" + ");
        currentField = "exoticCombo";
      } else if (label.startsWith("recommended super")) {
        slot(rank).super = values.join(" or ");
        currentField = "super";
      } else if (label.startsWith("recommended abilities")) {
        currentField = "abilities";
      } else if (label.startsWith("recommended aspects")) {
        slot(rank).aspects = values.join(", ");
        currentField = "aspects";
      } else if (label.startsWith("recommended fragments")) {
        slot(rank).fragments = values.filter((value) => /^facet of/i.test(value)).join(", ");
        currentField = "fragments";
      } else if (/^(class ability|melee ability|grenade)$/.test(label)) {
        const build = slot(rank);
        const entry = `${label}: ${values.join(" or ")}`;
        build.abilities = build.abilities ? `${build.abilities}; ${entry}` : entry;
        currentField = "abilities";
      } else if (!label && values.length > 0) {
        // Continuation rows: more aspects or fragments for the block above.
        const build = slot(rank);
        const facets = values.filter((value) => /^facet of/i.test(value));
        if (currentField === "fragments" && facets.length > 0) {
          build.fragments = [build.fragments, ...facets].filter(Boolean).join(", ");
        } else if (currentField === "aspects" && facets.length === 0) {
          build.aspects = [build.aspects, ...values].filter(Boolean).join(", ");
        }
      }
    }
  }

  return [...builds.values()].filter((build) => build.exoticCombo.length > 0);
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
      await tx
        .insert(schema.builds)
        .values(builds.map((build) => ({ ...build, source: SOURCE, sourceUrl: SHEET_URL })));
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
