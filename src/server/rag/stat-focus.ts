import type { Origin } from "./context.ts";

// A guide often states no stat order, but the build's own pieces say which abilities it
// leans on. This derives a focus from those pieces and labels it as derived, never as
// something the guide said.

type Signal = {
  stat: string;
  patterns: RegExp;
  reason: string;
};

const SIGNALS: Signal[] = [
  {
    stat: "Grenade",
    patterns:
      /\bgrenade|turret|bleak watcher|glacial harvest|stasis shard|threadling|tangle|duskfield|vortex|storm grenade|healing grenade|fusion grenade|grapple|suspend/i,
    reason: "the build's loop runs through grenades",
  },
  {
    stat: "Melee",
    patterns:
      /\bmelee|punch|thunderclap|consecration|knife|throwing hammer|arcane needle|shiver strike|grapple melee|howl of the storm/i,
    reason: "the build's loop runs through melee",
  },
  {
    stat: "Class",
    patterns:
      /\bclass ability|healing rift|empowering rift|rift|dodge|barricade|phoenix dive|frostpulse/i,
    reason: "the build depends on its class ability",
  },
  {
    stat: "Super",
    patterns:
      /\bsuper|well of radiance|nova bomb|thundercrash|song of flame|twilight arsenal|silence and squall|blade barrage|stasis crystal|crystal/i,
    reason: "the build leans on Super uptime",
  },
  {
    stat: "Weapons",
    patterns:
      /\bweapon damage|kinetic|weapon surge|reload|holster|final blows with weapons|weapon final blows/i,
    reason: "the build leans on weapon damage",
  },
  {
    stat: "Health",
    patterns:
      /\bgm\b|grandmaster|master|contest|surviv|resist|overshield|difficult|endgame|flinch/i,
    reason: "the content punishes mistakes, so Health matters",
  },
];

export type StatFocus = {
  order: string[];
  reasons: string[];
};

export function deriveStatFocus(text: string): StatFocus | null {
  const matches = SIGNALS.map((signal) => {
    const found = [...text.matchAll(new RegExp(signal.patterns.source, "gi"))].map((hit) =>
      hit[0].toLowerCase(),
    );
    const terms = [...new Set(found)];
    return { signal, hits: found.length, terms };
  }).filter((entry) => entry.hits > 0);

  if (matches.length === 0) return null;

  // Howl of the Storm crystals do not scale with the Melee stat above 100; the Super stat
  // does. Community testing moved that build to 200 Super for this reason.
  const howl = /howl of the storm|stasis crystal/i.test(text);
  if (howl) {
    const superSignal = matches.find((entry) => entry.signal.stat === "Super");
    if (superSignal) {
      superSignal.hits += 3;
      superSignal.terms = [...new Set([...superSignal.terms, "howl of the storm"])];
    } else {
      matches.push({
        signal: SIGNALS.find((signal) => signal.stat === "Super")!,
        hits: 3,
        terms: ["howl of the storm"],
      });
    }
    const melee = matches.find((entry) => entry.signal.stat === "Melee");
    if (melee) melee.hits -= 2;
  }

  // A negative score means the piece does not feed that stat, so drop it entirely.
  const kept = matches.filter((entry) => entry.hits > 0).sort((a, b) => b.hits - a.hits);
  const order = kept.map((entry) => entry.signal.stat);
  const reasons = kept.map((entry) => {
    const reason =
      howl && entry.signal.stat === "Super"
        ? "Melee stat does not scale Howl of the Storm crystals, so the points go into Super for Glacial Quake"
        : entry.signal.reason;
    return `${entry.signal.stat} (${entry.terms.join(", ")}): ${reason}`;
  });

  return { order, reasons };
}

export function queryStatFocus(question: string): {
  text: string;
  origins: Origin[];
} {
  if (!/\bstat|stats|stat focus|priority\b/i.test(question)) return { text: "", origins: [] };
  const focus = deriveStatFocus(question);
  if (!focus) return { text: "", origins: [] };

  return {
    text: `Derived stat focus (from the build's own pieces, not quoted from a guide):\npriority ${focus.order.join(" > ")}\n${focus.reasons.join("\n")}\nSay this is derived from the build's loop and that the guide does not state a priority.`,
    origins: [],
  };
}
