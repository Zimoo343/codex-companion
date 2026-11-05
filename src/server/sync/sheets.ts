import { parseCsv } from "./csv.ts";
import { slugColumn, toIntegerOrNull } from "./normalise.ts";

const AEGIS_SHEET_ID = "1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY";

export const AEGIS_TABS = [
  "Archetypes",
  "HGLs",
  "LFRs",
  "LMGs",
  "Rockets",
  "Autos",
  "Bows",
  "HCs",
  "Pulses",
  "Scouts",
  "Sidearms",
  "SMGs",
  "BGLs",
  "Fusions",
  "Glaives",
  "Shotguns",
  "Snipers",
  "Rocket Sidearms",
  "Traces",
  "Swords",
  "Other",
] as const;

export type AegisWeaponRow = {
  tab: string;
  name: string;
  season: string;
  energy: string;
  frame: string;
  source: string;
  ammo: string;
  barrel: string;
  magazine: string;
  masterwork: string;
  perk1: string;
  perk2: string;
  originTrait: string;
  notes: string;
  tier: string;
};

export type AegisArchetypeRow = {
  weapon: string;
  frame: string;
  ammo: string;
  tier: string;
  oneMagBdps: number | null;
  typicalBdps: number | null;
  maxBdps: number | null;
  row: Record<string, string>;
};

export async function fetchSheetRows(tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${AEGIS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`sheet tab ${tab} failed: ${response.status}`);
  return parseCsv(await response.text());
}

// Header names change upstream, so map by name and fail loudly on the ones the
// import depends on rather than silently writing empty strings.
export function buildAegisWeapons(tab: string, rows: string[][]): AegisWeaponRow[] {
  const header = rows[0];
  if (!header) return [];

  const column = (...names: string[]) =>
    header.findIndex((cell) => names.some((name) => cell.toLowerCase().includes(name)));

  const index = {
    name: column("name"),
    season: column("season"),
    energy: column("energy"),
    frame: column("frame"),
    source: column("source"),
    ammo: column("ammo"),
    barrel: column("barrel"),
    magazine: column("mag"),
    masterwork: column("mw", "masterwork"),
    perk1: column("perk 1", "perk1"),
    perk2: column("perk 2", "perk2"),
    origin: column("origin"),
    notes: column("notes", "analysis"),
    tier: column("tier"),
  };

  if (index.name < 0) throw new Error(`sheet tab ${tab} has no name column`);

  const result: AegisWeaponRow[] = [];
  for (const row of rows.slice(1)) {
    const pick = (key: keyof typeof index) => {
      const at = index[key];
      return at >= 0 ? (row[at] ?? "").trim() : "";
    };

    const name = pick("name");
    if (!name) continue;

    result.push({
      tab,
      name,
      season: pick("season"),
      energy: pick("energy"),
      frame: pick("frame"),
      source: pick("source"),
      ammo: pick("ammo"),
      barrel: pick("barrel"),
      magazine: pick("magazine"),
      masterwork: pick("masterwork"),
      perk1: pick("perk1"),
      perk2: pick("perk2"),
      originTrait: pick("origin"),
      notes: pick("notes"),
      tier: pick("tier"),
    });
  }

  return result;
}

// The Archetypes tab is the damage math. Its column set is wide and versioned by
// the sheet's own header row, so the whole row is kept and a few columns are
// pulled out for querying.
export function buildAegisArchetypes(rows: string[][]): AegisArchetypeRow[] {
  const header = rows[0];
  if (!header) return [];

  const keys = header.map(slugColumn);
  const uniqueKeys = keys.map((key, index) =>
    keys.indexOf(key) === index ? key : `${key}_${index}`,
  );

  const result: AegisArchetypeRow[] = [];
  for (const row of rows.slice(1)) {
    const record: Record<string, string> = {};
    uniqueKeys.forEach((key, index) => {
      record[key] = (row[index] ?? "").trim();
    });

    const weapon = record.weapon;
    if (!weapon) continue;

    result.push({
      weapon,
      frame: record.frame ?? "",
      ammo: record.ammo ?? "",
      tier: record.tier ?? "",
      oneMagBdps: toIntegerOrNull(record["1mag_bdps"]),
      typicalBdps: toIntegerOrNull(record.typical_bdps),
      maxBdps: toIntegerOrNull(record.max_bdps),
      row: record,
    });
  }

  return result;
}
