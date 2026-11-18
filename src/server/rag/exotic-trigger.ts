import type { Origin } from "./context.ts";
import { createDatabase } from "../db/client.ts";

// An exotic that names one ability only pays out for that ability. Stating the trigger
// in code stops the model from pairing Thunderclap armour with a Consecration loop.

const TRIGGERS: Array<[string, RegExp]> = [
  ["thunderclap", /\bthunderclap\b/i],
  ["melee", /\bmelee\b/i],
  ["grenade", /\bgrenade\b/i],
  ["super", /\bsuper\b/i],
  ["class ability", /\bclass ability\b|\bdodge\b|\bbarricade\b|\brift\b/i],
  ["weapon", /\bweapon|final blows?\b/i],
];

export async function queryExoticTrigger(
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  const lower = question.toLowerCase();
  if (!/\b(exotic|armou?r|build|pair|use|with)\b/i.test(question)) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const rows = await pool.query<{ name: string; perks: string[] }>(
      "select name, perks from armor where lower(tier) = 'exotic'",
    );

    const named = rows.rows.filter(
      (row) => row.name.length > 4 && lower.includes(row.name.toLowerCase()),
    );
    if (named.length === 0) return { text: "", origins: [] };

    const lines = named.map((row) => {
      const perk = (row.perks ?? [])[0] ?? "";
      const triggers = TRIGGERS.filter(([, pattern]) => pattern.test(perk)).map(([name]) => name);
      return `${row.name}: perk "${perk.replace(/\s+/g, " ").trim()}" | pays off only when: ${
        triggers.join(", ") || "unclear"
      }`;
    });

    return {
      text: `Exotic trigger check (Bungie manifest):\n${lines.join("\n")}\nIf the build's loop uses a different ability from the one named above, say the exotic does not pay off for that loop. Class item perks such as Spirit of Contact are a separate item with their own trigger; never treat them as the same exotic.`,
      origins: [
        { title: "Exotic armour", sourceName: "Bungie manifest", url: "https://www.bungie.net" },
      ],
    };
  } finally {
    await pool.end();
  }
}
