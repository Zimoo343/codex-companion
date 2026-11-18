import type { Origin } from "./context.ts";
import { createDatabase } from "../db/client.ts";

// When no published build matches, assemble one from the game's own parts. Every
// pick must point at the text that justified it, so a reader can reject it.

const SUBCLASSES = ["prismatic", "solar", "arc", "void", "stasis", "strand"] as const;
type Subclass = (typeof SUBCLASSES)[number];

type Goal = { keys: string[]; words: RegExp };

const GOALS: Goal[] = [
  {
    keys: ["threadling", "tangle", "suspend", "strand"],
    words: /threadling|tangle|suspend|woven mail|unravel/i,
  },
  {
    keys: ["grenade", "ability", "spam"],
    words: /grenade|ability energy|melee energy|class ability/i,
  },
  { keys: ["melee", "punch"], words: /melee|punch/i },
  { keys: ["super"], words: /super|class ability/i },
  { keys: ["survive", "surviv", "resist", "tank"], words: /resist|heal|shield|invis|overshield/i },
  { keys: ["add clear", "adds", "crowd"], words: /explosion|chain|area|scorch|jolt/i },
];

const SUBCLASS_VERBS: Record<Subclass, RegExp> = {
  void: /devour|invisib|overshield|volatile|weaken/i,
  solar: /scorch|ignit|restor|radiant|explosion/i,
  arc: /jolt|amplif|blind|ionic|chain/i,
  stasis: /slow|freeze|shatter|crystal/i,
  strand: /threadling|tangle|suspend|woven/i,
  prismatic: /light|dark|transcend|ability/i,
};

function goalsFor(question: string, subclass?: Subclass): Goal[] {
  const lower = question.toLowerCase();
  const matched = GOALS.filter((goal) => goal.keys.some((key) => lower.includes(key)));
  if (subclass) matched.push({ keys: [], words: SUBCLASS_VERBS[subclass] });
  return matched;
}

function score(text: string, goals: Goal[]): number {
  return goals.reduce((total, goal) => total + (goal.words.test(text) ? 1 : 0), 0);
}

function clip(text: string, limit = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

export async function composeBuild(question: string): Promise<{ text: string; origins: Origin[] }> {
  const lower = question.toLowerCase();
  const subclass = SUBCLASSES.find((name) => lower.includes(name));
  const namedClass = /\b(hunter|titan|warlock)\b/i.exec(question)?.[1]?.toLowerCase();
  if (!subclass || !namedClass) return { text: "", origins: [] };
  if (subclass === "prismatic" && !/prismatic/.test(lower)) return { text: "", origins: [] };

  const goals = goalsFor(question, subclass);
  // Pieces must answer something the player actually asked for; the subclass verb
  // list only widens the vocabulary, it cannot be the sole reason to pick an aspect.
  const specific = goals.filter((goal) => goal.keys.length > 0);
  if (goals.length === 0) return { text: "", origins: [] };
  const keep = (entry: { points: number; theme: number }) =>
    specific.length > 0 ? entry.points > 0 || entry.theme > 0 : entry.theme > 0;

  const { pool } = createDatabase();
  try {
    const plugs = await pool.query<{
      name: string;
      kind: string;
      class: string;
      description: string;
    }>(
      `select name, kind, class, description from subclass_plugs
        where element = $1
          and (kind = 'aspect' or kind = 'fragment')
          and (class = $2 or class = 'shared' or class = '' or class is null)`,
      [subclass, namedClass],
    );

    const aspects = plugs.rows
      .filter((row) => row.kind === "aspect")
      .map((row) => ({
        row,
        points: score(row.description ?? "", specific),
        theme: score(row.description ?? "", goals),
      }))
      .filter(keep)
      .sort((a, b) => b.points - a.points || b.theme - a.theme)
      .slice(0, 2);

    const fragments = plugs.rows
      .filter((row) => row.kind === "fragment")
      .map((row) => ({
        row,
        points: score(row.description ?? "", specific),
        theme: score(row.description ?? "", goals),
      }))
      .filter(keep)
      .sort((a, b) => b.points - a.points || b.theme - a.theme)
      .slice(0, 5);

    const exotics = await pool.query<{ name: string; slot: string; perks: string[] }>(
      `select name, slot, perks from armor
        where lower(class) = $1 and lower(tier) = 'exotic'`,
      [namedClass],
    );
    const exotic = exotics.rows
      .map((row) => ({
        row,
        points: score([...(row.perks ?? []), ""].join(" "), goals),
      }))
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points)[0];

    const sets = await pool.query<{ name: string; bonuses: unknown }>(
      "select name, bonuses from armor_sets",
    );
    const set = sets.rows
      .map((row) => {
        const text = (row.bonuses as Array<{ perk: string; description: string }>)
          .map((bonus) => `${bonus.perk} ${bonus.description}`)
          .join(" ");
        return { row, points: score(text, goals) };
      })
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points)[0];

    if (aspects.length === 0 && fragments.length === 0) return { text: "", origins: [] };

    const lines: string[] = [
      `Composed ${subclass} ${namedClass} (from game data, not a published build):`,
    ];
    lines.push(
      `aspects: ${aspects.map((entry) => `${entry.row.name} (${clip(entry.row.description ?? "")})`).join("; ") || "none matched"}`,
    );
    lines.push(
      `fragments: ${fragments.map((entry) => `${entry.row.name} (${clip(entry.row.description ?? "")})`).join("; ") || "none matched"}`,
    );
    if (exotic) {
      lines.push(`exotic: ${exotic.row.name} (${clip((exotic.row.perks ?? []).join(" "))})`);
    }
    if (set) {
      lines.push(`armour set candidate: ${set.row.name}`);
    }
    lines.push(
      "Label this as composed from game data, not a creator's build. Do not call it meta or best.",
    );

    return {
      text: lines.join("\n"),
      origins: [
        {
          title: "Aspects and fragments",
          sourceName: "Bungie manifest",
          url: "https://www.bungie.net",
        },
        { title: "Exotic armour", sourceName: "Bungie manifest", url: "https://www.bungie.net" },
      ],
    };
  } finally {
    await pool.end();
  }
}
