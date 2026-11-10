import { detectIntent, type QuestionIntent } from "./intent.ts";
import { createDatabase } from "../db/client.ts";
import { currentStatLine } from "../../lib/stats.ts";

type Row = Record<string, unknown>;

export type Origin = { title: string; sourceName: string; url: string };

const AEGIS_URL =
  "https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY";
const BOSS_URL =
  "https://docs.google.com/spreadsheets/d/1_5wtBjRYHHxuF4oJKDb_iOGZs-wTkzB6RYbnyNLbuz4";
const DDC_URL =
  "https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4";
const SHEET_CLASS_ITEMS =
  "https://docs.google.com/spreadsheets/d/1-pvCrjb9QLEwvQn0YquCxvZzMh25gMIh4ZrNe1DdAsY";

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
      sections.push(
        "Answer rule: state both the burst (one magazine) result and the sustained (typical) result. Do not give a single pick without both labels.",
      );
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
      `select name, type, tier, damage_type, ammo_type, stats, source, access
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
            `select name, slot, class, description, perks, source
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

// Damage rotations live in the Boss Damage sheet's Swap and Sustained tabs, which no
// entity text captures well.
async function queryRotations(
  intent: QuestionIntent,
): Promise<{ text: string; origins: Origin[] }> {
  if (!intent.wantsRotation) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const patterns = intent.phrases.map((phrase) => `%${phrase}%`);
    const result = await pool.query(
      `select tab, section, row::text as data,
              (select count(*) from unnest($1::text[]) phrase where row::text ilike phrase) as hits,
              (row::text ilike '%exotic%') as mentions_exotic
         from sheet_rows
        where source = 'AegisRelic Boss Damage'
          and tab in ('Swap', 'Sustained', 'Weapons', 'Ranking (S29)')
        order by mentions_exotic desc, hits desc, length(row::text) asc
        limit 8`,
      [patterns],
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows.map((entry) => `[${entry.tab}] ${entry.data}`);
    return {
      text: `Damage rotation and swap entries (AegisRelic Boss Damage):\n${lines.join("\n")}`,
      origins: [
        { title: "Boss Damage · rotations", sourceName: "AegisRelic Boss Damage", url: BOSS_URL },
      ],
    };
  } finally {
    await pool.end();
  }
}

// When the question asks for an exotic weapon, list the actual exotics rather than
// whatever an embedding happened to surface.
async function queryExoticWeapons(
  intent: QuestionIntent,
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  if (!intent.wantsExotic || !intent.wantsWeapon || intent.wantsArmor) {
    return { text: "", origins: [] };
  }

  const element = /\b(solar|arc|void|stasis|strand|kinetic)\b/i.exec(question)?.[1];
  const { pool } = createDatabase();
  try {
    // A pairing must not share a slot with the weapon being paired. Find the anchor
    // weapon by name, else assume heavy when the question says "rocket".
    const anchor = await pool.query<{ name: string; ammo_type: string }>(
      `select name, ammo_type from weapons
        where length(name) > 3 and position(lower(name) in lower($1)) > 0
        order by length(name) desc
        limit 1`,
      [question],
    );
    const anchorAmmo = anchor.rows[0]?.ammo_type ?? null;
    const excludeAmmo = anchorAmmo ?? (/\b(rocket|heavy|boss)\b/i.test(question) ? "Heavy" : null);

    const result = await pool.query(
      `select name, type, damage_type, ammo_type
         from weapons
        where tier = 'Exotic'
          and ($1::text is null or damage_type ilike $1)
          and ($2::text is null or ammo_type <> $2)
        order by ammo_type, name
        limit 15`,
      [element ?? null, excludeAmmo],
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows.map(
      (row) => `${row.name}: Exotic ${row.damage_type} ${row.type}, ${row.ammo_type} ammo`,
    );
    return {
      text: `Exotic weapons${element ? ` (${element})` : ""}:\n${lines.join("\n")}`,
      origins: [
        { title: "Exotic weapons", sourceName: "Bungie manifest", url: "https://www.bungie.net" },
      ],
    };
  } finally {
    await pool.end();
  }
}

// "Pair it with..." follow-ups need a different ammo slot. Without an explicit
// list the model reaches for another heavy weapon, which is impossible in game.
async function queryPairing(context: string): Promise<{ text: string; origins: Origin[] }> {
  if (!/\bpair|pairing\b|with it\b/i.test(context)) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const anchor = await pool.query<{
      name: string;
      ammo_type: string;
      type: string;
      damage_type: string;
    }>(
      `select name, ammo_type, type, damage_type from weapons
        where length(name) > 3 and position(lower(name) in lower($1)) > 0
        order by length(name) desc
        limit 1`,
      [context],
    );
    const weapon = anchor.rows[0];
    if (!weapon) return { text: "", origins: [] };

    const alternatives =
      weapon.ammo_type === "Heavy"
        ? ["Special", "Primary"]
        : weapon.ammo_type === "Special"
          ? ["Heavy", "Primary"]
          : ["Heavy", "Special"];

    const options = await pool.query<{
      name: string;
      type: string;
      damage_type: string;
      ammo_type: string;
      tier: string;
      source: string;
    }>(
      `select w.name, w.type, w.damage_type, w.ammo_type, a.tier, w.source
         from weapons w
         join aegis_weapons a on lower(a.name) = lower(w.name)
        where w.ammo_type = any($1::text[]) and a.tier in ('S', 'A', 'B')
        order by w.ammo_type, case a.tier when 'S' then 0 when 'A' then 1 else 2 end, w.name
        limit 12`,
      [alternatives],
    );

    const lines = options.rows.map(
      (row) =>
        `${row.name} (${row.ammo_type} ${row.damage_type} ${row.type}, ${row.tier} tier): ${row.source || "source not stated"}`,
    );

    return {
      text: `Pairing anchor: ${weapon.name} is ${weapon.ammo_type} ammo (${weapon.damage_type} ${weapon.type}). It cannot pair with another ${weapon.ammo_type} weapon. Pair it with ${alternatives.join(" or ")} ammo.\nDifferent-slot options:\n${lines.length > 0 ? lines.join("\n") : "none listed"}`,
      origins: [
        {
          title: "Pairing options",
          sourceName: "Bungie manifest",
          url: "https://www.bungie.net",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

// Exotic class items and builds were missing entirely: a class item rolls two Spirit
// perks, so a single perk row never answers "which combos exist".
async function queryClassItems(
  intent: QuestionIntent,
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  const wantsClassItem = /class item|spirit of|dual destiny|exotic class/i.test(question);
  const wantsBuild = /\bbuild\b|loadout|aspect|fragment/i.test(question);
  if (!wantsClassItem && !wantsBuild) return { text: "", origins: [] };

  const namedClass = ["hunter", "titan", "warlock"].find((name) =>
    intent.phrases.some((phrase) => phrase === name),
  );

  const { pool } = createDatabase();
  try {
    const sections: string[] = [];

    if (wantsClassItem) {
      const combos = await pool.query(
        `select class, trait_one, trait_two from class_item_combos
          where ($1::text is null or lower(class) = $1)
          order by class, trait_one
          limit 12`,
        [namedClass ?? null],
      );
      if (combos.rows.length > 0) {
        sections.push(
          `Exotic class item combinations (unordered; the sheet does not rate them). Do not rank, shortlist or call any of these best; state that the list is unordered.\n${combos.rows
            .map((row) => `${row.class}: ${row.trait_one} + ${row.trait_two}`)
            .join("\n")}`,
        );
      }
    }

    if (wantsBuild) {
      const builds = await pool.query(
        `select class, rank, exotic_combo, super, abilities, aspects, fragments from builds
          where ($1::text is null or lower(class) = $1)
          order by class, rank`,
        [namedClass ?? null],
      );
      if (builds.rows.length > 0) {
        sections.push(
          `Recommended builds:\n${builds.rows
            .map(
              (row) =>
                `${row.class} build ${row.rank}: ${row.exotic_combo}; super ${row.super}; abilities ${row.abilities}; aspects ${row.aspects}; fragments ${row.fragments}`,
            )
            .join("\n")}`,
        );
      }
    }

    if (sections.length === 0) return { text: "", origins: [] };

    return {
      text: sections.join("\n\n"),
      origins: [
        {
          title: "Class items · combinations",
          sourceName: "AegisRelic class items",
          url: SHEET_CLASS_ITEMS,
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

// No source of ours tracks "popular", so an armour question is answered with the
// actual options for that class, each with its perk text.
async function queryExpansions(question: string): Promise<{ text: string; origins: Origin[] }> {
  if (!/\bdlc|expansions?\b|\bbuy\b|purchase|free to play|free\b|\bown\b|require/i.test(question)) {
    return { text: "", origins: [] };
  }

  const { pool } = createDatabase();
  try {
    const result = await pool.query(
      `select name, free, subclasses, activities, bundle, includes from expansions order by bundle, id`,
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows.map((row) => {
      const activities = (row.activities as string[]).join(", ");
      const subclasses = (row.subclasses as string[]).join(", ");

      if (row.bundle) {
        const includes = (row.includes as string[]).join(", ");
        return `${row.name} (bundle): includes ${includes || "every expansion"}`;
      }

      return `${row.name} (${row.free ? "free" : "paid"}): ${activities || "no activities listed"}${subclasses ? `; subclass ${subclasses}` : ""}`;
    });

    return {
      text: `Expansions and what they own (maintained by hand, reviewed 2026-11-05):\n${lines.join("\n")}`,
      origins: [
        {
          title: "Expansions",
          sourceName: "Maintained notes",
          url: "https://www.bungie.net/7/en/Destiny",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

// Community builds: published compositions, cited to the guide that lists them.
async function queryCommunityBuilds(
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  const wantsBuild = /\bbuilds?\b|loadout|aspects?|fragments?/i.test(question);
  if (!wantsBuild) return { text: "", origins: [] };

  const namedClass = /\b(hunter|titan|warlock)\b/i.exec(question)?.[1]?.toLowerCase();
  const subclasses = ["prismatic", "solar", "arc", "void", "stasis", "strand"].filter((name) =>
    question.toLowerCase().includes(name),
  );

  const { pool } = createDatabase();
  try {
    const result = await pool.query(
      `select name, class, subclass, exotics, aspects, fragments, abilities, stats, requires, source, source_url
         from community_builds
        where ($1::text is null or lower(class) = $1)
          and (cardinality($2::text[]) = 0 or lower(subclass) = any($2))
        order by random()
        limit 5`,
      [namedClass ?? null, subclasses],
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    // No stat synthesis: a build either states a current stat priority or it does not.
    // Guides from before the rework use retired stats, and guessing an order for them
    // produced confidently wrong advice.
    const lines = result.rows.map((row) => {
      const exotics = (row.exotics as string[]).join(" + ");
      const aspects = (row.aspects as string[]).join(", ");
      const fragments = (row.fragments as string[]).join(", ");
      const abilities = (row.abilities as string[]).join(", ");
      const current = currentStatLine(String(row.stats));
      const stats = current
        ? `stat priority ${current}`
        : "no current stat priority stated (guide predates the Edge of Fate stat rework)";
      return `${row.subclass} ${row.class} with ${exotics} (listed by ${row.source} as "${row.name}"): aspects ${aspects}; fragments ${fragments}; abilities ${abilities}; ${stats}; requires ${row.requires}`;
    });

    return {
      text: `Published community builds:\n${lines.join("\n")}`,
      origins: [
        {
          title: "Best Destiny 2 Builds",
          sourceName: "Blueberries.gg",
          url: "https://www.blueberries.gg/armor/best-destiny-2-builds/",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

// When the question is about what a new or free-to-play player can actually get,
// answer from obtainable, tiered items and respect the ammo slot asked about.
// Destiny Data Compendium explains what each armour stat does above and below 100.
// This is the authoritative source for stat behaviour, so it is quoted rather than
// described from memory.
async function queryStatSystem(question: string): Promise<{ text: string; origins: Origin[] }> {
  const wantsStats = /\bstat|stats|build\b/i.test(question);
  if (!wantsStats) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const result = await pool.query<{ row: Record<string, string> }>(
      `select row from sheet_rows
        where tab = 'Game Mechanics'
          and row::text ~* 'ENHANCED BENEFIT'
          and row::text ~* '(Health|Melee|Grenade|Super|Class|Weapons)'
        limit 8`,
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows
      .map((entry) => {
        const stat = entry.row.col_2 ?? "";
        const description = (entry.row.col_4 ?? "").replace(/\s+/g, " ").slice(0, 400);
        return stat && description ? `${stat}: ${description}` : "";
      })
      .filter(Boolean);

    if (lines.length === 0) return { text: "", origins: [] };

    return {
      text: `Armour stat behaviour (Destiny Data Compendium):\n${lines.join("\n")}`,
      origins: [
        {
          title: "Game Mechanics · stats",
          sourceName: "Destiny Data Compendium",
          url: "https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

async function queryAccessibleWeapons(
  intent: QuestionIntent,
  question: string,
): Promise<{ text: string; origins: Origin[] }> {
  const wantsAccessible =
    /\b(easy|free|f2p|new player|new light|cheap|no dlc|solo|beginner)\b/i.test(question);
  if (!wantsAccessible) return { text: "", origins: [] };

  const familyHints: Record<string, string> = {
    Rockets: "Rocket Launcher",
    HGLs: "Grenade Launcher",
    BGLs: "Grenade Launcher",
    LFRs: "Linear Fusion Rifle",
    LMGs: "Machine Gun",
    Autos: "Auto Rifle",
    HCs: "Hand Cannon",
    Pulses: "Pulse Rifle",
    Scouts: "Scout Rifle",
    Sidearms: "Sidearm",
    SMGs: "Submachine Gun",
    Fusions: "Fusion Rifle",
    Glaives: "Glaive",
    Shotguns: "Shotgun",
    Snipers: "Sniper Rifle",
    Traces: "Trace Rifle",
    Swords: "Sword",
    Bows: "Bow",
  };
  const typeHint = intent.families.map((family) => familyHints[family]).find(Boolean);
  const ammoHint = /\bheavy|power\b/i.test(question)
    ? "Heavy"
    : /\bspecial\b/i.test(question)
      ? "Special"
      : /\bprimary\b/i.test(question)
        ? "Primary"
        : null;

  const { pool } = createDatabase();
  try {
    const result = await pool.query(
      `select w.name, w.type, w.damage_type, w.ammo_type, w.access, w.source,
              a.tier, a.notes,
              (w.source ~* 'gambit prime|black armory|forge|leviathan|menagerie|reckoning|scourge of the past|crown of sorrow|sundial') as stale_source
         from weapons w
         join aegis_weapons a on lower(a.name) = lower(w.name)
        where w.access in ('free', 'event')
          and ($1::text is null or w.type ilike '%' || $1 || '%')
          and ($2::text is null or w.ammo_type = $2)
          and a.tier in ('S', 'A', 'B')
        order by case a.tier when 'S' then 0 when 'A' then 1 else 2 end, w.name
        limit 10`,
      [typeHint ?? null, ammoHint],
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows.map(
      (row) =>
        `${row.name} (${row.tier} tier, ${row.damage_type} ${row.ammo_type} ${row.type}): access ${row.access}; ${row.source || "source unknown"}${row.stale_source ? " (in-game source text is historical and no longer accurate)" : ""}; ${row.notes || ""}`,
    );

    return {
      text: `Obtainable weapons${typeHint ? ` (${typeHint})` : ""}${ammoHint ? `, ${ammoHint} ammo` : ""}:\n${lines.join("\n")}`,
      origins: [
        {
          title: "Obtainable weapons",
          sourceName: "Bungie manifest",
          url: "https://www.bungie.net",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

async function queryArmorSets(
  intent: QuestionIntent,
): Promise<{ text: string; origins: Origin[] }> {
  if (!/\barmou?r sets?\b|set bonus|2.?piece|4.?piece/i.test(intent.phrases.join(" "))) {
    return { text: "", origins: [] };
  }

  const { pool } = createDatabase();
  try {
    const patterns = intent.phrases.map((phrase) => `%${phrase}%`);
    const named = await pool.query(
      `select name, bonuses from armor_sets
        where name ilike any($1)
        limit 5`,
      [patterns],
    );

    const rows =
      named.rows.length > 0
        ? named.rows
        : (await pool.query(`select name, bonuses from armor_sets order by name limit 6`)).rows;

    if (rows.length === 0) return { text: "", origins: [] };

    const lines = rows.map((row) => {
      const bonuses = (row.bonuses as Array<{ pieces: number; perk: string; description: string }>)
        .map((bonus) => `${bonus.pieces}pc ${bonus.perk}: ${bonus.description}`)
        .join(" ");
      return `${row.name}: ${bonuses}`;
    });

    return {
      text: `Armour sets and their bonuses:\n${lines.join("\n")}`,
      origins: [
        { title: "Armour sets", sourceName: "Bungie manifest", url: "https://www.bungie.net" },
      ],
    };
  } finally {
    await pool.end();
  }
}

async function queryArmorForClass(question: string): Promise<{ text: string; origins: Origin[] }> {
  const namedClass = /\b(hunter|titan|warlock)\b/i.exec(question)?.[1]?.toLowerCase();
  const asksArmor = /\bexotic|armor|helmet|gauntlet|chest|leg|class item\b/i.test(question);
  if (!namedClass || !asksArmor) return { text: "", origins: [] };

  const { pool } = createDatabase();
  try {
    const result = await pool.query(
      `select name, slot, left(description, 180) as effect
         from armor
        where lower(class) = $1
        order by name
        limit 10`,
      [namedClass],
    );
    if (result.rows.length === 0) return { text: "", origins: [] };

    const lines = result.rows.map(
      (row) => `${row.name} (${row.slot}): ${String(row.effect).replace(/\s+/g, " ")}`,
    );
    return {
      text: `${namedClass} exotic armour, from the manifest:\n${lines.join("\n")}`,
      origins: [
        { title: "Exotic armour", sourceName: "Bungie manifest", url: "https://www.bungie.net" },
      ],
    };
  } finally {
    await pool.end();
  }
}

async function querySheets(intent: QuestionIntent): Promise<{ text: string; origins: Origin[] }> {
  const { pool } = createDatabase();
  try {
    const patterns = intent.phrases.map((phrase) => `%${phrase}%`);

    // Keep tabs in the category that was asked about: an exotic weapon question must
    // not surface armour perks or class abilities.
    const ARMOR_TABS = [
      "Armor Perks",
      "Armor Mods",
      "Exotic Armors",
      "Exotic Class",
      "Class Abilities",
    ];
    const excluded = intent.wantsWeapon && !intent.wantsArmor ? [...ARMOR_TABS] : [];
    if (intent.phrases.some((phrase) => /\bsets?\b/.test(phrase))) excluded.push("Exotic Armors");

    const result = await pool.query(
      `select source, tab, section, row::text as data,
              (select count(*) from unnest($1::text[]) phrase where row::text ilike phrase
                 or section ilike phrase or tab ilike phrase) as hits
         from sheet_rows
        where (row::text ilike any($1) or section ilike any($1) or tab ilike any($1))
          and not (tab = any($2::text[]))
        order by hits desc, length(row::text) asc
        limit 6`,
      [patterns, excluded],
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

// Resolve "which pack owns this item" in code. Letting the model match a Source line
// against the expansion list produced confident nonsense (Ice Breaker -> Duality).
async function queryAcquisition(question: string): Promise<{ text: string; origins: Origin[] }> {
  const { pool } = createDatabase();
  try {
    const items = await pool.query<{ name: string; source: string }>(
      `select name, source from weapons
        where length(name) > 3 and position(lower(name) in lower($1)) > 0 and source <> ''
        union all
       select name, source from armor
        where length(name) > 3 and position(lower(name) in lower($1)) > 0 and source <> ''
        limit 4`,
      [question],
    );

    const lines: string[] = [];

    for (const item of items.rows) {
      const match = await pool.query<{ name: string; free: boolean }>(
        `select e.name, e.free
           from expansions e, jsonb_array_elements_text(e.activities) as activity
          where $1 ilike '%' || activity || '%'
          limit 1`,
        [item.source],
      );
      const expansion = match.rows[0];
      lines.push(
        `${item.name}: source is "${item.source}"${
          expansion
            ? `, which belongs to ${expansion.name} (${expansion.free ? "free" : "paid"})`
            : ", which is not in the expansion list, so the purchase requirement is unknown"
        }.`,
      );
    }

    // A question can name the activity directly, with no item in it.
    if (lines.length === 0) {
      for (const expansion of await pool
        .query<{ name: string; free: boolean }>(`select name, free from expansions`)
        .then((result) => result.rows)) {
        if (question.toLowerCase().includes(expansion.name.toLowerCase())) {
          lines.push(
            `${expansion.name} is ${expansion.free ? "free to play" : "a paid expansion"}.`,
          );
        }
      }
    }

    if (lines.length === 0) return { text: "", origins: [] };

    return {
      text: `Acquisition:\n${lines.join("\n")}`,
      origins: [
        {
          title: "Expansions",
          sourceName: "Maintained notes",
          url: "https://www.bungie.net/7/en/Destiny",
        },
      ],
    };
  } finally {
    await pool.end();
  }
}

export async function buildStructuredContext(
  question: string,
  history = "",
): Promise<{ text: string; origins: Origin[] }> {
  // Follow-ups like "pair it with something" only make sense with the earlier turns.
  const context = history ? `${history}\n${question}` : question;
  const intent = detectIntent(context);
  const heavyOnly = /\b(heavy|power|boss)\b/i.test(context);
  // Frame-level damage tables ignore obtainability, so they are withheld when the
  // question is about what a new or free-to-play player can actually get.
  const wantsAccessible =
    /\b(easy|free|f2p|new player|new light|cheap|no dlc|solo|beginner)\b/i.test(context);
  const parts = await Promise.all([
    queryFamilies(intent.families, intent.wantsDamage && !wantsAccessible, heavyOnly),
    queryEntities(intent),
    querySheets(intent),
    queryRotations(intent),
    queryExoticWeapons(intent, context),
    queryPairing(context),
    queryClassItems(intent, context),
    queryArmorForClass(context),
    queryArmorSets(intent),
    queryCommunityBuilds(context),
    queryAccessibleWeapons(intent, context),
    queryStatSystem(context),
    queryExpansions(context),
    queryAcquisition(context),
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

  return {
    text: parts
      .map((part) => part.text)
      .filter(Boolean)
      .join("\n\n"),
    origins,
  };
}
