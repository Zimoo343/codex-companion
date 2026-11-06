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
      `select name, type, tier, damage_type, ammo_type, frame, stats, perks
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
        ]),
        { type: row.type, tier: row.tier },
      );
    }

    const armor = await pool.query(`select name, slot, class, description, perks from armor`);
    for (const row of armor.rows) {
      push(
        "armor",
        row.name,
        sentence([
          `${row.name} is an Exotic ${row.slot} for ${row.class}.`,
          row.description,
          Array.isArray(row.perks) ? (row.perks as string[]).join(" ") : "",
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
