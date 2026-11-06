// Structured context is assembled in code rather than by asking the model to run
// SQL: one model call per question keeps answers cheap and predictable.

const FAMILY_KEYWORDS: Array<{ tab: string; words: string[] }> = [
  { tab: "Rocket Sidearms", words: ["rocket sidearm", "rocket sidearms"] },
  { tab: "Rockets", words: ["rocket launcher", "rockets", "rocket"] },
  { tab: "BGLs", words: ["breech grenade", "breech gl", "single shot grenade"] },
  { tab: "HGLs", words: ["grenade launcher", "hgl", "drum grenade"] },
  { tab: "LFRs", words: ["linear fusion", "lfr"] },
  { tab: "LMGs", words: ["machine gun", "lmg"] },
  { tab: "Autos", words: ["auto rifle", "autos"] },
  { tab: "HCs", words: ["hand cannon"] },
  { tab: "Pulses", words: ["pulse rifle", "pulse"] },
  { tab: "Scouts", words: ["scout rifle", "scout"] },
  { tab: "Sidearms", words: ["sidearm"] },
  { tab: "SMGs", words: ["submachine gun", "smg"] },
  { tab: "Fusions", words: ["fusion rifle", "fusion"] },
  { tab: "Glaives", words: ["glaive"] },
  { tab: "Shotguns", words: ["shotgun"] },
  { tab: "Snipers", words: ["sniper"] },
  { tab: "Traces", words: ["trace rifle", "trace"] },
  { tab: "Swords", words: ["sword"] },
  { tab: "Bows", words: ["bow"] },
];

const DAMAGE_WORDS = ["dps", "damage", "best", "meta", "tier", "strongest", "top"];
const ARMOR_WORDS = [
  "armor",
  "helmet",
  "gauntlet",
  "chest",
  "leg armor",
  "class item",
  "exotic",
  "stat",
];
const ACTIVITY_WORDS = ["raid", "dungeon", "strike", "nightfall", "lost sector", "exotic mission"];
const SUBCLASS_WORDS = [
  "aspect",
  "fragment",
  "subclass",
  "artifact",
  "super",
  "melee",
  "grenade ability",
];

const STOP_WORDS = new Set([
  "what",
  "whats",
  "which",
  "who",
  "how",
  "does",
  "do",
  "is",
  "are",
  "the",
  "a",
  "an",
  "for",
  "on",
  "in",
  "to",
  "of",
  "and",
  "or",
  "with",
  "my",
  "me",
  "i",
  "you",
  "best",
  "good",
  "should",
  "use",
  "using",
  "can",
  "get",
  "there",
  "this",
  "that",
  "it",
  "its",
  "about",
  "tell",
  "any",
  "some",
  "currently",
  "right",
  "now",
  "slot",
  "weapon",
  "weapons",
]);

export type QuestionIntent = {
  families: string[];
  phrases: string[];
  wantsDamage: boolean;
  wantsArmor: boolean;
  wantsActivity: boolean;
  wantsSubclass: boolean;
};

export function detectIntent(question: string): QuestionIntent {
  const text = question.toLowerCase();

  // "rocket" is inside "rocket sidearm", and "fusion" inside "linear fusion".
  // Keep only the most specific match so a question does not pull two families.
  const matched: Array<{ tab: string; word: string }> = [];
  for (const family of FAMILY_KEYWORDS) {
    const hit = family.words
      .filter((word) => text.includes(word))
      .sort((a, b) => b.length - a.length)[0];
    if (hit) matched.push({ tab: family.tab, word: hit });
  }
  const families = [
    ...new Set(
      matched
        .filter(
          (entry) =>
            !matched.some(
              (other) =>
                other !== entry &&
                other.word.length > entry.word.length &&
                other.word.includes(entry.word),
            ),
        )
        .map((entry) => entry.tab),
    ),
  ];

  const words = text
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  // Two-word phrases catch most weapon and activity names: "edge transit",
  // "vault of glass", "bait and switch".
  const phrases: string[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    phrases.push(word);
    const next = words[index + 1];
    if (next) phrases.push(`${word} ${next}`);
  }

  return {
    families: [...families],
    phrases: [...new Set(phrases)].slice(0, 8),
    wantsDamage: DAMAGE_WORDS.some((word) => text.includes(word)),
    wantsArmor: ARMOR_WORDS.some((word) => text.includes(word)),
    wantsActivity: ACTIVITY_WORDS.some((word) => text.includes(word)),
    wantsSubclass: SUBCLASS_WORDS.some((word) => text.includes(word)),
  };
}
