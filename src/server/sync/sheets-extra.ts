import { eq } from "drizzle-orm";
import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { parseCsv } from "./csv.ts";
import { parseSections } from "./sheet-sections.ts";

export type SheetSource = {
  name: string;
  sheetId: string;
  tabs: string[];
  url: string;
  credit: string;
  licenseNote: string;
};

export const SHEET_SOURCES: SheetSource[] = [
  {
    name: "Destiny Data Compendium",
    sheetId: "1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4",
    tabs: [
      "Weapon Perks",
      "Armor Perks",
      "Artifact Perks",
      "Armor Mods",
      "Arc",
      "Solar",
      "Void",
      "Stasis",
      "Strand",
      "Prismatic",
      "Exotic Class",
      "Class Abilities",
      "Exotic Weapons",
      "Exotic Armors",
      "Game Mechanics",
    ],
    url: "https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4",
    credit: "Destiny Data Compendium contributors",
    licenseNote: "Community work. Credited and linked, never re-hosted.",
  },
  {
    name: "AegisRelic Boss Damage",
    sheetId: "1_5wtBjRYHHxuF4oJKDb_iOGZs-wTkzB6RYbnyNLbuz4",
    tabs: [
      "Weapons",
      "Abilties",
      "Scaling (old)",
      "Ranking (S29)",
      "Sustained",
      "Swap",
      "Bosses",
      "Pack Hunter",
      "Bolt Charge",
    ],
    url: "https://docs.google.com/spreadsheets/d/1_5wtBjRYHHxuF4oJKDb_iOGZs-wTkzB6RYbnyNLbuz4",
    credit: "AegisRelic",
    licenseNote: "Community work. Credited and linked, never re-hosted.",
  },
];

async function fetchTab(sheetId: string, tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${tab} failed: ${response.status}`);
  return parseCsv(await response.text());
}

export async function syncCommunitySheets(): Promise<Record<string, number>> {
  const { db, pool } = createDatabase();
  const counts: Record<string, number> = {};

  for (const source of SHEET_SOURCES) {
    const rows: Array<typeof schema.sheetRows.$inferInsert> = [];

    for (const tab of source.tabs) {
      const parsed = parseSections(await fetchTab(source.sheetId, tab));
      for (const section of parsed) {
        for (const row of section.rows) {
          rows.push({ source: source.name, tab, section: section.section, row });
        }
      }
      console.log(
        `${source.name} / ${tab}: ${parsed.reduce((sum, s) => sum + s.rows.length, 0)} rows`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.sheetRows).where(eq(schema.sheetRows.source, source.name));
      for (let index = 0; index < rows.length; index += 500) {
        await tx.insert(schema.sheetRows).values(rows.slice(index, index + 500));
      }
      await tx
        .insert(schema.sources)
        .values({
          name: source.name,
          url: source.url,
          credit: source.credit,
          licenseNote: source.licenseNote,
        })
        .onConflictDoNothing();
    });

    counts[source.name] = rows.length;
  }

  await pool.end();
  return counts;
}
