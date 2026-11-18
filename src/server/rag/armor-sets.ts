import type { QuestionIntent } from "./intent.ts";
import type { Origin } from "./context.ts";
import { createDatabase } from "../db/client.ts";

type SetRow = { name: string; bonuses: unknown };
type Bonus = { pieces: number; perk: string; description: string };

const ASKS_SETS = /\barmou?r sets?\b|set bonus|2.?piece|4.?piece/i;

// What the build is trying to do decides which bonuses can honestly be called a
// fit. Without this the resolver handed over whichever sets sorted first, which is
// how a melee set ended up recommended to a grenade build.
const FOCUS: Array<[string, RegExp]> = [
  ["grenade", /\bgrenade|threadling|tangle|suspend|unravel|volatile|scorch|jolt|ionic|strand/i],
  ["melee", /\bmelee|punch|glaive|sword/i],
  ["super", /\bsuper|well|nova|golden gun|thundercrash/i],
  ["survivability", /\bsurviv|resist|heal|invis|overshield|shield|flinch/i],
  ["ammo", /\bammo|reserve|weapon damage|reload/i],
];

function bonusText(row: SetRow): string {
  return (row.bonuses as Bonus[])
    .map((bonus) => `${bonus.perk} ${bonus.description}`)
    .join(" ")
    .toLowerCase();
}

export async function queryArmorSets(
  intent: QuestionIntent,
  context: string,
): Promise<{ text: string; origins: Origin[] }> {
  if (!ASKS_SETS.test(context)) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const sets = await pool.query<SetRow>("select name, bonuses from armor_sets");

    // The Compendium armour rows carry the set source under the set name, e.g.
    // "Flain\n\nSundered Doctrine\nDungeon". That is the only acquisition we have.
    const sources = new Map<string, string>();
    const sheet = await pool.query<{ row: { "Armor Set"?: string } }>(
      "select row from sheet_rows where tab = 'Armor Perks' and row::text ilike '%Armor Set%'",
    );
    for (const entry of sheet.rows) {
      const raw = entry.row["Armor Set"];
      if (!raw) continue;
      const parts = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const [name, ...rest] = parts;
      if (name && rest.length > 0) sources.set(name.toLowerCase(), rest.join(" "));
    }

    const describe = (row: SetRow): string => {
      const bonuses = (row.bonuses as Bonus[])
        .map((bonus) => `${bonus.pieces}pc ${bonus.perk}: ${bonus.description}`)
        .join(" ");
      const source = sources.get(row.name.toLowerCase()) ?? "not recorded";
      return `${row.name}: ${bonuses} | acquisition: ${source}`;
    };

    const lower = context.toLowerCase();
    const named = sets.rows.filter(
      (row) => row.name.length > 4 && lower.includes(row.name.toLowerCase()),
    );

    const origins: Origin[] = [
      { title: "Armour sets", sourceName: "Bungie manifest", url: "https://www.bungie.net" },
    ];

    if (named.length > 0) {
      return {
        text: `Armour sets and their bonuses:\n${named.map(describe).join("\n")}`,
        origins,
      };
    }

    const wanted = FOCUS.filter(([, pattern]) => pattern.test(context)).map(([name]) => name);
    if (wanted.length === 0) {
      return {
        text: "Armour sets: the question names no set and no build focus, so no set bonus can be matched. Do not offer unrelated sets.",
        origins: [],
      };
    }

    const scored = sets.rows
      .map((row) => {
        const text = bonusText(row);
        const hits = wanted.filter((focus) =>
          FOCUS.find(([name]) => name === focus)?.[1].test(text),
        );
        return { row, hits, score: hits.length };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length === 0) {
      return {
        text: `Armour sets: none of the recorded set bonuses mention ${wanted.join(" or ")}. There is no set that matches this build; say so instead of offering an unrelated one.`,
        origins: [],
      };
    }

    const lines = scored.map(
      (entry) => `${describe(entry.row)} (matches: ${entry.hits.join(", ")})`,
    );
    return {
      text: `Armour sets whose bonuses mention the build's focus:\n${lines.join("\n")}`,
      origins,
    };
  } finally {
    await pool.end();
  }
}
