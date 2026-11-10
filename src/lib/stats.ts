// Post-Edge-of-Fate armour stats: Health, Melee, Grenade, Super, Class, Weapons.
// Each runs 0-200. Up to 100 gives cooldown/ability regeneration; above 100 adds
// damage for that stat's ability (grenade, melee, super, weapon damage).
//
// Pre-rework names (Mobility, Resilience, Recovery, Discipline, Intellect, Strength)
// are NOT interchangeable with these, and guides written before the rework do not
// state current priorities. They are detected and reported as outdated, not translated.

export function usesLegacyStats(text: string): boolean {
  return /\b(resilience|mobility|recovery|discipline|intellect|strength)\b/i.test(text);
}

// Current stat line, or an empty string when the source only knows the old system.
export function currentStatLine(stats: string): string {
  const trimmed = stats.trim();
  if (trimmed.length === 0) return "";
  return usesLegacyStats(trimmed) ? "" : trimmed;
}

export const STAT_SYSTEM_NOTE =
  "Current armour stats are Health, Melee, Grenade, Super, Class and Weapons, each 0-200. Up to 100 gives cooldown and regeneration benefits; above 100 adds damage for that stat. Guides written before the Edge of Fate rework use retired stat names and do not state a current priority.";
