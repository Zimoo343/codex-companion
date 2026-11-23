import type { Origin } from "./context.ts";
import { createDatabase } from "../db/client.ts";

// Follow-ups like "not a rocket, heavy, precision" carry hard constraints. Without
// parsing them the resolver keeps answering the earlier question.

type Constraints = {
  ammo: "Heavy" | "Special" | "Primary" | null;
  excludeTypes: string[];
  precisionOnly: boolean;
  ask: boolean;
};

const WEAPON_CONTEXT =
  /\b(weapon|rocket|sniper|linear|fusion|machine gun|lmg|grenade launcher|sword|bow|scout|hand cannon|auto rifle|pulse|sidearm|smg|shotgun|glaive|dps|damage)\b/i;

const EXCLUSIONS: Array<[RegExp, string]> = [
  [/\b(?:not|no|without|besides|other than|avoid)\b[^.]{0,30}\brockets?\b/i, "Rocket Launcher"],
  [
    /\b(?:not|no|without|besides|other than|avoid)\b[^.]{0,30}\bgrenade launchers?\b/i,
    "Grenade Launcher",
  ],
  [/\b(?:not|no|without|besides|other than|avoid)\b[^.]{0,30}\bswords?\b/i, "Sword"],
  [/\b(?:not|no|without|besides|other than|avoid)\b[^.]{0,30}\bsnipers?\b/i, "Sniper Rifle"],
];

function parse(question: string): Constraints {
  const text = question.toLowerCase();
  const ammo = /\bheavy\b|\bpower weapon\b/.test(text)
    ? "Heavy"
    : /\bspecial\b/.test(text)
      ? "Special"
      : /\bprimary\b/.test(text)
        ? "Primary"
        : null;

  const excludeTypes = EXCLUSIONS.filter(([pattern]) => pattern.test(text)).map(([, type]) => type);
  // Worrying about self-damage is a request to leave rockets out, even without the word "not".
  if (
    /blow(?:ing)? myself up|self[- ]?damage|kill myself/i.test(text) &&
    !excludeTypes.includes("Rocket Launcher")
  ) {
    excludeTypes.push("Rocket Launcher");
  }

  return {
    ammo,
    excludeTypes,
    precisionOnly:
      /\bprecision\b|\bno self[- ]?damage\b|\bwithout (?:blowing|killing) myself\b/i.test(text),
    ask: WEAPON_CONTEXT.test(text),
  };
}

export async function queryWeaponConstraints(
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  const constraints = parse(question);
  if (!constraints.ask) return { text: "", origins: [] };
  if (!constraints.ammo && constraints.excludeTypes.length === 0 && !constraints.precisionOnly) {
    return { text: "", origins: [] };
  }

  const { pool } = createDatabase();
  try {
    const result = await pool.query<{
      name: string;
      type: string;
      ammo_type: string;
      damage_type: string;
      tier: string;
      notes: string;
      access: string;
      source: string;
    }>(
      `select w.name, w.type, w.ammo_type, w.damage_type, a.tier, a.notes, w.access,
              coalesce(nullif(w.source, ''), a.source) as source
         from weapons w
         join aegis_weapons a on lower(a.name) = lower(w.name)
        where ($1::text is null or w.ammo_type = $1)
          and (cardinality($2::text[]) = 0 or w.type <> all($2))
          and ($3::boolean = false or w.type in ('Sniper Rifle', 'Linear Fusion Rifle'))
          and a.tier in ('S', 'A')
        order by case a.tier when 'S' then 0 else 1 end, w.name
        limit 8`,
      [constraints.ammo, constraints.excludeTypes, constraints.precisionOnly],
    );

    const wanted = [
      constraints.ammo ? `${constraints.ammo} ammo` : "",
      constraints.excludeTypes.length > 0 ? `not ${constraints.excludeTypes.join(", ")}` : "",
      constraints.precisionOnly ? "precision" : "",
    ]
      .filter(Boolean)
      .join(", ");

    if (result.rows.length === 0) {
      return {
        text: `Weapon constraints from the conversation: ${wanted}. No weapon in the data satisfies all of them. Say that plainly and do not substitute a weapon outside the constraints.`,
        origins: [],
      };
    }

    // The Aegis sheet often carries the source when the manifest collectible does not,
    // and the expansion table turns that source into an ownership requirement.
    const expansions = await pool.query<{ name: string; free: boolean; activities: string[] }>(
      "select name, free, activities from expansions",
    );
    const requirement = (source: string): string => {
      const match = expansions.rows.find((expansion) =>
        (expansion.activities ?? []).some(
          (activity) => activity && source.toLowerCase().includes(activity.toLowerCase()),
        ),
      );
      if (!match) return "";
      return `; requires ${match.name} (${match.free ? "free to play" : "paid"})`;
    };

    const lines = result.rows.map(
      (row) =>
        `${row.name} (${row.type}, ${row.ammo_type}${row.damage_type ? `, ${row.damage_type}` : ""}) ${row.tier} tier; source: ${row.source || "not recorded"}${requirement(row.source || "")}: ${(row.notes ?? "").replace(/\s+/g, " ").slice(0, 120)}`,
    );

    return {
      text: `Weapon constraints from the conversation: ${wanted}. Recommend only from these, never an excluded type. Include DLC-locked picks and state their source and whether access is free or needs a purchase.\n${lines.join("\n")}`,
      origins: [
        {
          title: "Weapon constraints",
          sourceName: "AegisRelic",
          url: "https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}
