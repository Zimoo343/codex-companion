import { createDatabase } from "../db/client.ts";
import { contentHash } from "./embed.ts";

export type EntityDocument = {
  kind: string;
  name: string;
  text: string;
  meta: Record<string, string>;
  contentHash: string;
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

const sentence = (parts: Array<string | null | undefined>) =>
  parts.map(clean).filter(Boolean).join(" ");

// Text is written the way a player would ask, so semantic search has something to
// match: role words, synonyms, what the thing does, and where it comes from.
export async function buildEntityDocuments(): Promise<EntityDocument[]> {
  const { pool } = createDatabase();
  const documents: EntityDocument[] = [];

  const push = (kind: string, name: string, text: string, meta: Record<string, string>) => {
    const body = clean(text);
    if (!name || body.length < 20) return;
    documents.push({
      kind,
      name: clean(name),
      text: body,
      meta,
      contentHash: contentHash(kind, name, body),
    });
  };

  try {
    const weapons = await pool.query(
      `select name, type, tier, damage_type, ammo_type, frame, stats, perks, source
         from weapons`,
    );
    for (const row of weapons.rows) {
      const perks = (row.perks as string[]).slice(0, 12).join(", ");
      const stats = Object.entries(row.stats as Record<string, number>)
        .filter(([key]) => /range|impact|stability|handling|reload|blast|velocity|rpm/i.test(key))
        .map(([key, value]) => `${key} ${value}`)
        .join(", ");
      push(
        "weapon",
        row.name,
        sentence([
          `${row.name} is a ${row.tier} ${row.damage_type} ${row.ammo_type} ${row.type}.`,
          row.frame && row.frame !== row.type ? `Archetype: ${row.frame}.` : "",
          stats ? `Stats: ${stats}.` : "",
          perks ? `Possible perks include ${perks}.` : "",
          row.source ? `Source: ${row.source}.` : "",
        ]),
        { type: row.type, tier: row.tier },
      );
    }

    const armor = await pool.query(
      `select name, slot, class, description, perks, source from armor`,
    );
    for (const row of armor.rows) {
      push(
        "armor",
        row.name,
        sentence([
          `${row.name} is an Exotic ${row.slot} for ${row.class}.`,
          row.description,
          Array.isArray(row.perks) ? (row.perks as string[]).join(" ") : "",
          row.source ? `Source: ${row.source}.` : "",
        ]),
        { slot: row.slot, class: row.class },
      );
    }

    const plugs = await pool.query(
      `select name, kind, class, element, description from subclass_plugs`,
    );
    for (const row of plugs.rows) {
      push(
        "subclass_plug",
        row.name,
        sentence([
          `${row.name} is a ${row.element} ${row.kind} for ${row.class}.`,
          row.description,
        ]),
        { kind: row.kind, element: row.element },
      );
    }

    const activities = await pool.query(
      `select name, type, place, destination, light_level, variants from activities`,
    );
    for (const row of activities.rows) {
      push(
        "activity",
        row.name,
        sentence([
          `${row.name} is a ${row.type} in Destiny 2.`,
          row.destination ? `Destination: ${row.destination}.` : "",
          row.place && row.place !== row.destination ? `Location: ${row.place}.` : "",
          row.variants > 1 ? `${row.variants} difficulty versions exist.` : "",
        ]),
        { type: row.type, destination: row.destination },
      );
    }

    const recommended = await pool.query(
      `select name, tab, tier, frame, energy, source, perk1, perk2, origin_trait, notes
         from aegis_weapons`,
    );
    for (const row of recommended.rows) {
      push(
        "recommendation",
        `${row.name} (${row.tab})`,
        sentence([
          `${row.name} is a ${row.tier} tier ${row.energy} ${row.frame} from ${row.tab}, dropped from ${row.source}.`,
          row.perk1 ? `Recommended perks: ${row.perk1}.` : "",
          row.perk2 ? `Second column: ${row.perk2}.` : "",
          row.origin_trait ? `Origin trait: ${row.origin_trait}.` : "",
          row.notes,
        ]),
        { tab: row.tab, tier: row.tier },
      );
    }

    const archetypes = await pool.query(
      `select weapon, frame, ammo, tier, one_mag_bdps, typical_bdps, max_bdps,
              row->>'analysis_notes' as notes
         from aegis_archetypes`,
    );
    for (const row of archetypes.rows) {
      push(
        "damage_frame",
        `${row.weapon} ${row.frame}`,
        sentence([
          `${row.weapon} ${row.frame} is a ${row.ammo} ammo frame, tier ${row.tier}.`,
          row.one_mag_bdps ? `Burst damage ${row.one_mag_bdps} per second for one magazine.` : "",
          row.typical_bdps ? `Sustained damage ${row.typical_bdps} per second.` : "",
          row.max_bdps ? `Maximum with perfect swaps ${row.max_bdps}.` : "",
          row.notes,
        ]),
        { ammo: row.ammo, tier: row.tier },
      );
    }

    // Expansions: which pack owns which activities and subclass.
    const expansions = await pool.query(
      `select name, free, subclasses, activities, note from expansions order by id`,
    );
    for (const row of expansions.rows) {
      const activities = (row.activities as string[]) ?? [];
      const subclasses = (row.subclasses as string[]) ?? [];
      push(
        "expansion",
        row.name,
        sentence([
          `${row.name} is a ${row.free ? "free" : "paid"} Destiny 2 release.`,
          subclasses.length > 0 ? `Unlocks the ${subclasses.join(", ")} subclass.` : "",
          activities.length > 0 ? `Includes or owns: ${activities.join(", ")}.` : "",
          row.note,
        ]),
        { expansion: row.name, free: String(row.free) },
      );
    }

    // Armour sets: the 2-piece and 4-piece bonuses are the thing players ask about.
    const sets = await pool.query(`select name, pieces, bonuses from armor_sets`);
    for (const row of sets.rows) {
      const bonuses = (row.bonuses as Array<{ pieces: number; perk: string; description: string }>)
        .map((bonus) => `${bonus.pieces} pieces (${bonus.perk}): ${bonus.description}`)
        .join(" ");
      push(
        "armor_set",
        `${row.name} armor set`,
        `${row.name} armour set. ${bonuses} Pieces in the set: ${(row.pieces as string[]).join(", ")}.`,
        { set: row.name },
      );
    }

    // Exotic class items: one document per known pairing, plus the recommended builds.
    const combos = await pool.query(`select class, trait_one, trait_two from class_item_combos`);
    for (const row of combos.rows) {
      push(
        "class_item_combo",
        `${row.class} ${row.trait_one} + ${row.trait_two}`,
        `${row.class} exotic class item combination: ${row.trait_one} together with ${row.trait_two}. Exotic class items carry two Spirit perks, one in each column, and this is a pairing listed by AegisRelic's class item sheet.`,
        { class: row.class },
      );
    }

    const builds = await pool.query(
      `select class, rank, exotic_combo, super, abilities, aspects, fragments from builds`,
    );
    for (const row of builds.rows) {
      push(
        "build",
        `${row.class} build ${row.rank}`,
        sentence([
          `${row.class} build: ${row.exotic_combo}.`,
          row.super ? `Super: ${row.super}.` : "",
          row.abilities ? `Abilities: ${row.abilities}.` : "",
          row.aspects ? `Aspects: ${row.aspects}.` : "",
          row.fragments ? `Fragments: ${row.fragments}.` : "",
        ]),
        { class: row.class },
      );
    }

    const sheetRows = await pool.query(`select source, tab, section, row from sheet_rows`);
    for (const sheetRow of sheetRows.rows) {
      const entries = Object.entries(sheetRow.row as Record<string, string>).filter(
        ([key, value]) => value.length < 2000 && !key.startsWith("col_"),
      );
      if (entries.length < 2) continue;

      const nameEntry = entries.find(([key]) =>
        /^(name|perk|boss|armor|ability|mod|item)$/i.test(key),
      );
      const name = nameEntry?.[1] ?? entries[0]?.[1] ?? "";
      const body = entries.map(([key, value]) => `${key}: ${value}.`).join(" ");

      push(
        "sheet_row",
        clean(name).slice(0, 120),
        `${sheetRow.tab}${sheetRow.section ? `, ${sheetRow.section}` : ""}. ${body}`,
        {
          source: sheetRow.source,
          tab: sheetRow.tab,
        },
      );
    }
  } finally {
    await pool.end();
  }

  return documents;
}
