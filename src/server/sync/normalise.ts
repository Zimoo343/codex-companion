// Pure reshaping rules shared by the importers. Kept separate from the database
// and network code so they can be tested directly.

export type WeaponRow = {
  hash: string;
  name: string;
  type: string;
  tier: string;
  damageType: string;
  frame: string;
  ammoType: string;
  stats: Record<string, number>;
  perks: string[];
  source: string;
};

export type ArmorRow = {
  name: string;
  slot: string;
  class: string;
  tier: string;
  stats: Record<string, number>;
  perks: string[];
  description: string;
  source: string;
};

export type SubclassPlugRow = {
  name: string;
  kind: "aspect" | "fragment" | "artifact perk";
  class: string;
  element: string;
  description: string;
};

export type ActivityRow = {
  name: string;
  type: string;
  place: string;
  destination: string;
  lightLevel: number;
  isPvp: boolean;
  variants: number;
};

export const ALLOWED_ACTIVITY_TYPES = new Set([
  "Raid",
  "Dungeon",
  "Strike",
  "Nightfall",
  "Vanguard Op",
  "Exotic Mission",
  "Lost Sector",
  "Onslaught",
  "Seasonal Arena",
  "Nightmare Hunt",
  "Empire Hunt",
]);

export function stripHtml(text: string | undefined): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Duality: Standard" and "Duality: Master" are the same dungeon at two
// difficulties. The manifest also lists legacy and featured variants, which are
// dropped rather than merged.
export function normalizeActivityName(rawName: string): string {
  return rawName.split(":")[0]!.replace(/\s+/g, " ").trim();
}

export function isImportableActivity(rawName: string): boolean {
  const name = normalizeActivityName(rawName);
  return name.length > 0 && !name.startsWith("Featured");
}

// Reissued weapons appear once per version with slightly different plug lists.
// The widest plug list is the closest thing to the current definition.
export function pickRichestWeapon(weapons: WeaponRow[]): WeaponRow | undefined {
  let best: WeaponRow | undefined;
  for (const weapon of weapons) {
    if (!best || weapon.perks.length > best.perks.length) best = weapon;
  }
  return best;
}

export function dedupeWeapons(weapons: WeaponRow[]): WeaponRow[] {
  const byName = new Map<string, WeaponRow[]>();
  for (const weapon of weapons) {
    const group = byName.get(weapon.name);
    if (group) group.push(weapon);
    else byName.set(weapon.name, [weapon]);
  }

  const kept: WeaponRow[] = [];
  for (const group of byName.values()) {
    const best = pickRichestWeapon(group);
    if (best) kept.push(best);
  }
  return kept;
}

export function collapseActivities(
  raw: Array<Omit<ActivityRow, "variants"> & { variants?: number }>,
): ActivityRow[] {
  const byKey = new Map<string, ActivityRow>();

  for (const activity of raw) {
    if (!isImportableActivity(activity.name)) continue;
    if (!ALLOWED_ACTIVITY_TYPES.has(activity.type)) continue;

    const name = normalizeActivityName(activity.name);
    const key = `${activity.type}|${name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.variants += 1;
      continue;
    }

    byKey.set(key, { ...activity, name, variants: 1 });
  }

  return [...byKey.values()];
}

// Sheet headers are human sentences, sometimes with line breaks and emoji.
// Turn them into stable SQL column names.
export function slugColumn(header: string, index: number): string {
  const slug = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(values|calculations)_/, "");
  return slug ? slug : `col_${index}`;
}

export function toIntegerOrNull(value: string | undefined): number | null {
  const cleaned = (value ?? "").replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned));
}
