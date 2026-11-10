// Before the Edge of Fate rework, armour stats were Mobility, Resilience, Recovery,
// Discipline, Intellect and Strength. Current stats are Health, Melee, Grenade,
// Super, Class and Weapons.
//
// There is no safe 1:1 translation: Mobility is not Weapons, and Resilience was far
// more valuable than Health is in PvE. So legacy stat lines are not translated; they
// are treated as advisory only and withheld from answers.

export function usesLegacyStats(text: string): boolean {
  return /\b(resilience|mobility|recovery|discipline|intellect|strength)\b/i.test(text);
}

// Returns the stat line to show, or an empty string when the source's stat advice
// predates the rework and cannot be mapped onto current stats.
export function currentStats(stats: string): string {
  if (stats.trim().length === 0) return "";
  return usesLegacyStats(stats) ? "" : stats.trim();
}

export const LEGACY_STATS_NOTE =
  "the guide's stat advice predates the Edge of Fate stat rework, so it is not repeated here";
