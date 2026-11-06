import { detectIntent, type QuestionIntent } from "./intent.ts";
import { createDatabase } from "../db/client.ts";

type Row = Record<string, unknown>;

export type Origin = { title: string; sourceName: string; url: string };

const AEGIS_URL = "https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY";
const BOSS_URL = "https://docs.google.com/spreadsheets/d/1_5wtBjRYHHxuF4oJKDb_iOGZs-wTkzB6RYbnyNLbuz4";
const DDC_URL = "https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4";

export function sheetUrl(source: string): string {
  if (source === "AegisRelic Boss Damage") return BOSS_URL;
  if (source === "Destiny Data Compendium") return DDC_URL;
  return AEGIS_URL;
}

function describe(rows: Row[]): string {
  if (rows.length === 0) return "no rows";
  return rows
    .map((row) =>
      Object.entries(row)
        .filter(([, value]) => value !== null && value !== "" && value !== undefined)
        .map(([key, value]) => `${key}: ${String(value).replace(/\s+/g, " ").trim()}`)
        .join(" | "),
    )
    .join("\n");
}

// Every query is capped and shaped for reading by a model, not for pagination.
async function queryFamilies(
  families: string[],
  wantsDamage: boolean,
  heavyOnly: boolean,
): Promise<{ text: string; origins: Origin[] }> {
  if (families.length === 0 && !wantsDamage) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const sections: string[] = [];

    if (families.length > 0) {
      const weapons = await pool.query(
        `select name, tier, frame, source, perk1, perk2, notes
           from aegis_weapons
          where tab = any($1)
          order by case tier when 'S' then 0 when 'A' then 1 when 'B' then 2 else 3 end
          limit 8`,
        [families],
      );
      sections.push(`Recommended ${families.join(", ")} (AegisRelic):\n${describe(weapons.rows)}`);
    }

    if (wantsDamage) {
      // "Heavy" questions should not be answered with special ammo weapons.
      const ammoFilter = heavyOnly ? "where ammo = 'Power'" : "";
      const burst = await pool.query(
        `select row_number() over (order by one_mag_bdps desc nulls last) as rank,
                weapon, frame, ammo, one_mag_bdps, max_bdps, typical_bdps, tier
           from aegis_archetypes
           ${ammoFilter}
          order by one_mag_bdps desc nulls last limit 6`,
      );
      const sustained = await pool.query(
        `select row_number() over (order by typical_bdps desc nulls last) as rank,
                weapon, frame, ammo, typical_bdps, max_bdps, one_mag_bdps, tier
           from aegis_archetypes
           ${ammoFilter}
          order by typical_bdps desc nulls last limit 6`,
      );
      // analysis_notes lives inside the sheet's raw row, not in its own column.
      const notes = await pool.query(
        `select weapon, frame, row->>'analysis_notes' as analysis_notes
           from aegis_archetypes
          where coalesce(row->>'analysis_notes', '') <> ''
          order by one_mag_bdps desc nulls last limit 6`,
      );

      sections.push(`Burst damage by frame (1mag_bdps, one magazine):\n${describe(burst.rows)}`);
      sections.push(
        `Sustained damage by frame (typical_bdps, realistic):\n${describe(sustained.rows)}`,
      );
      sections.push(`Frame analysis notes:\n${describe(notes.rows)}`);
    }

    const origins: Origin[] = sections.length
      ? [{ title: "Endgame Analysis", sourceName: "AegisRelic", url: AEGIS_URL }]
      : [];

    return { text: sections.join("\n\n"), origins };
  } finally {
    await pool.end();
  }
}

async function queryEntities(intent: QuestionIntent): Promise<{ text: string; origins: Origin[] }> {
  const { pool } = createDatabase();
  const origins: Origin[] = [];
  const remember = (title: string) => {
    if (!origins.some((origin) => origin.title === title)) {
      origins.push({ title, sourceName: "Bungie manifest", url: "https://www.bungie.net" });
    }
  };
  try {
    const sections: string[] = [];
    const patterns = intent.phrases.map((phrase) => `%${phrase}%`);

    const weapons = await pool.query(
      `select name, type, tier, damage_type, ammo_type, stats
         from weapons
        where name ilike any($1)
        limit 5`,
      [patterns],
    );
    if (weapons.rows.length > 0) {
      sections.push(`Matching weapons (manifest stats):\n${describe(weapons.rows)}`);
    }

    const recommended = await pool.query(
      `select name, tab, tier, frame, source, perk1, perk2, notes
         from aegis_weapons
        where name ilike any($1)
        limit 5`,
      [patterns],
    );
    if (recommended.rows.length > 0) {
      sections.push(`Matching recommendations (AegisRelic):\n${describe(recommended.rows)}`);
    }

    if (intent.wantsArmor) {
      // A question like "exotic armor for survivability" names no item, so look at
      // what the exotic perks actually do, scoped to the class if one was named.
      const namedClass = ["hunter", "titan", "warlock"].find((name) =>
        intent.phrases.some((phrase) => phrase === name),
      );

      const armor = namedClass
        ? await pool.query(
            `select name, slot, class, description, perks
               from armor
              where lower(class) = $1
                and description ~* '(heal|health|invisib|damage reduction|overshield|resist|restore)'
              order by length(description) desc
              limit 6`,
            [namedClass],
          )
        : await pool.query(
            `select name, slot, class, description, perks
               from armor
              where name ilike any($1)
              limit 5`,
            [patterns],
          );
      if (armor.rows.length > 0) {
        sections.push(`Matching exotic armor:\n${describe(armor.rows)}`);
      }
    }

    if (intent.wantsActivity) {
      const activities = await pool.query(
        `select name, type, destination, variants
           from activities
          where name ilike any($1)
          limit 5`,
        [patterns],
      );
      if (activities.rows.length > 0) {
        sections.push(`Matching activities:\n${describe(activities.rows)}`);
      }
    }

    if (intent.wantsSubclass) {
      const plugs = await pool.query(
        `select name, kind, class, element, description
           from subclass_plugs
          where name ilike any($1) or description ilike any($1)
          limit 5`,
        [patterns],
      );
      if (plugs.rows.length > 0) {
        sections.push(`Matching aspects, fragments and artifact perks:\n${describe(plugs.rows)}`);
        remember("Aspects and fragments");
      }
    }

    return { text: sections.join("\n\n"), origins };
  } finally {
    await pool.end();
  }
}

async function querySheets(intent: QuestionIntent): Promise<{ text: string; origins: Origin[] }> {
  const { pool } = createDatabase();
  try {
    const patterns = intent.phrases.map((phrase) => `%${phrase}%`);
    const result = await pool.query(
      `select source, tab, section, row::text as data,
              (select count(*) from unnest($1::text[]) phrase where row::text ilike phrase
                 or section ilike phrase or tab ilike phrase) as hits
         from sheet_rows
        where row::text ilike any($1) or section ilike any($1) or tab ilike any($1)
        order by hits desc, length(row::text) asc
        limit 6`,
      [patterns],
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows.map((entry) => {
      const where = [entry.source, entry.tab, entry.section].filter(Boolean).join(" / ");
      return `[${where}] ${entry.data}`;
    });

    const origins: Origin[] = [];
    for (const entry of result.rows) {
      const source = String(entry.source);
      const key = `${source} · ${entry.tab}`;
      if (!origins.some((origin) => origin.title === key)) {
        origins.push({ title: key, sourceName: source, url: sheetUrl(source) });
      }
    }

    return { text: `Community sheet rows:\n${lines.join("\n")}`, origins };
  } finally {
    await pool.end();
  }
}

export async function buildStructuredContext(
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  const intent = detectIntent(question);
  const heavyOnly = /\b(heavy|power|boss)\b/i.test(question);
  const parts = await Promise.all([
    queryFamilies(intent.families, intent.wantsDamage, heavyOnly),
    queryEntities(intent),
    querySheets(intent),
  ]);

  const origins: Origin[] = [];
  for (const part of parts) {
    for (const origin of part.origins) {
      const duplicate = origins.some(
        (existing) => existing.title === origin.title && existing.sourceName === origin.sourceName,
      );
      if (!duplicate) origins.push(origin);
    }
  }

  return { text: parts.map((part) => part.text).filter(Boolean).join("\n\n"), origins };
}
