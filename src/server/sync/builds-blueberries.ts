import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";

const HUB = "https://www.blueberries.gg/armor/best-destiny-2-builds/";
const SOURCE = "Blueberries.gg";
const AUTHOR = "Ric Molina";
const USER_AGENT = "codex-companion/0.1 (+personal Destiny 2 companion)";
const DELAY_MS = 1200;

const PAGE_HINTS = [
  "/armor/destiny-2-hunter-builds/",
  "/armor/destiny-2-warlock-builds/",
  "/armor/destiny-2-titan-builds/",
  "/armor/hunter-prismatic-builds/",
  "/armor/warlock-prismatic-builds/",
  "/armor/titan-prismatic-builds/",
  "/armor/destiny-2-hunter-strand-builds/",
  "/armor/destiny-2-warlock-strand-builds/",
  "/armor/destiny-2-titan-strand-builds/",
  "/armor/hunter-stasis-build/",
  "/armor/warlock-stasis-builds/",
  "/armor/titan-stasis-builds/",
  "/armor/hunter-arc-builds/",
  "/armor/warlock-arc-builds/",
  "/armor/titan-arc-builds/",
  "/armor/hunter-solar-builds/",
  "/armor/warlock-solar-builds/",
  "/armor/titan-solar-builds/",
  "/armor/hunter-void-builds/",
  "/armor/warlock-void-builds/",
  "/armor/titan-void-builds/",
];

type ParsedBuild = {
  name: string;
  class: string;
  subclass: string;
  exotics: string[];
  slot: string;
  acquisition: string;
  requires: string;
  aspects: string[];
  fragments: string[];
  abilities: string[];
  stats: string;
  mods: string;
  url: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.text();
}

export function decodeHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

function field(text: string, name: string, nextNames: string[]): string {
  const start = new RegExp(`${name}\\s*:`, "i").exec(text);
  if (!start) return "";
  const rest = text.slice(start.index + start[0].length);
  let end = rest.length;
  for (const candidate of nextNames) {
    const match = new RegExp(`${candidate}\\s*:`, "i").exec(rest);
    if (match && match.index < end) end = match.index;
  }
  return rest.slice(0, end).trim();
}

// Some pages put prose where the stat line should be ("Brawler. Armor Bonus Set &").
// A real stat line names at least one armour stat.
const KNOWN_STATS =
  /\b(health|melee|grenade|super|class|weapons|resilience|mobility|recovery|discipline|intellect|strength)\b/i;

function cleanStats(value: string): string {
  // The stat cell often runs into the next labelled block: "Max Resilience. Armor
  // Bonus Set &". Cut at that boundary and drop trailing punctuation.
  const trimmed = value
    .split(/Armor Bonus|Mods\s*:/i)[0]!
    .replace(/[\s.&,;:-]+$/, "")
    .trim();
  return KNOWN_STATS.test(trimmed) ? trimmed : "";
}

const splitList = (value: string): string[] =>
  value
    .replace(/\.$/, "")
    .split(/\s*,\s*|\s+and\s+/i)
    .map((entry) => entry.trim().replace(/\.$/, ""))
    .filter((entry) => entry.length > 0 && entry.length < 60);

// The page's "Abilities" field sometimes runs on into the Mods section, so mod names
// (Heavy Ammo Finder, Impact Induction) end up listed as abilities. Only entries that
// name a real ability survive.
const ABILITY =
  /\b(dodge|melee|grenade|super|rift|barrier|spike|needle|bomb|grapple|shiver|smoke|hammer|shield|sentinel|golden gun|nova|stormtrance|thundercrash|well|daybreak|maul|fists|quake|barrage|squall|storm|needlestorm|song|twilight|bolt|snare|tether|knife|staff|dive|pulse|wave|class ability)\b/i;

// Aspect and fragment cells carry editorial asides: "(to equip 5 Fragments)",
// "is the only required aspect", "The last Fragment is up to you". Keep the names only.
export const cleanNames = (value: string): string[] =>
  value
    .replace(/\([^)]*\)?/g, " ")
    .split(/\.\s+/)
    .flatMap((sentence) => splitList(sentence))
    .flatMap((entry) => entry.split(/\s+\+\s+/))
    .map((entry) => {
      let name = entry.split(/\s+(is|are)\s+/i)[0] ?? entry;
      while (/^(and|or|either|the)\s+/i.test(name)) {
        name = name.replace(/^(and|or|either|the)\s+/i, "");
      }
      return name
        .replace(/\s+/g, " ")
        .replace(/[\s.,;:]+$/, "")
        .trim();
    })
    .filter(
      (entry) =>
        /^[A-Z]/.test(entry) &&
        entry.length < 45 &&
        !/\b(is|are|equip|required|up to you|fun|content|instead|choose|last)\b/i.test(entry),
    );

export const abilityList = (value: string): string[] =>
  value
    .replace(/Silence and Squall/gi, "Silence & Squall")
    .split(/\.\s+/)
    .flatMap((sentence) => splitList(sentence))
    .map((entry) =>
      /^either dodge works$/i.test(entry)
        ? "Gambler’s Dodge or Marksman’s Dodge"
        : ({
            Squall: "Silence & Squall",
            "Storm Grenades": "Storm Grenade",
          }[entry] ?? entry),
    )
    .map((entry) =>
      entry
        .replace(/\s+for Super$/i, "")
        .replace(/^(and|or|either|a|an)\s+/i, "")
        .replace(/[\s.,;:]+$/, "")
        .trim(),
    )
    .filter(
      (entry) =>
        entry.length > 2 &&
        entry.length < 45 &&
        ABILITY.test(entry) &&
        !/\b(is|are|better|fun|recommended|content|instead|works|choice|your)\b/i.test(entry),
    );

// Mods arrive as "Helmet : X , Y . Arms : Z", so keep the slot with each entry instead
// of flattening them into one anonymous list.
const MOD_SLOTS = ["Helmet", "Arms", "Chest", "Legs", "Class Item"];

export function parseMods(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const parts: string[] = [];
  for (const slot of MOD_SLOTS) {
    const match = new RegExp(`${slot}\\s*:`, "i").exec(text);
    if (!match) continue;
    const rest = text.slice(match.index + match[0].length);
    let end = rest.length;
    for (const other of MOD_SLOTS) {
      const next = new RegExp(`${other}\\s*:`, "i").exec(rest);
      if (next && next.index < end) end = next.index;
    }
    const mods = rest
      .slice(0, end)
      .replace(/[\s.,;:]+$/, "")
      .trim();
    if (mods) parts.push(`${slot.toLowerCase()}: ${mods}`);
  }
  return parts.join("; ").slice(0, 600);
}

// Subclass is implied by the perks, not by the page URL: one "prismatic" page also
// carries Solar and Strand builds.
function inferSubclass(fragments: string[], aspects: string[]): string {
  const text = [...fragments, ...aspects].join(" ").toLowerCase();
  if (/facet of/.test(text)) return "Prismatic";
  if (/ember of/.test(text)) return "Solar";
  if (/spark of/.test(text)) return "Arc";
  if (/thread of/.test(text)) return "Strand";
  if (/echo of/.test(text)) return "Void";
  if (/whisper of|stasis/.test(text)) return "Stasis";
  return "";
}

const SKIP_TITLE =
  /^(more destiny|hunter builds|titan builds|warlock builds|before you go|see latest|deep dives|pvp essentials|related)/i;
const FIELDS = [
  "Name",
  "Class",
  "Slot",
  "Source",
  "Requires",
  "Exotic Perk",
  "Aspects",
  "Fragments",
  "Abilities",
  "Stats",
  "Mods",
];

export function parseBuildsPage(html: string, pageUrl: string): ParsedBuild[] {
  const headings = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((match) => ({
    title: decodeHtml(match[1] ?? ""),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  const builds: ParsedBuild[] = [];

  headings.forEach((heading, index) => {
    if (heading.title.length < 3 || SKIP_TITLE.test(heading.title)) return;

    const sectionEnd = headings[index + 1]?.start ?? html.length;
    const text = decodeHtml(html.slice(heading.end, sectionEnd));
    const gearEnd = text.search(/Aspects\s*:/i);
    const gearText = gearEnd === -1 ? text : text.slice(0, gearEnd);

    const exotics = [...gearText.matchAll(/Name\s*:\s*(.+?)(?=\sClass\s*:|$)/gi)].map((match) =>
      (match[1] ?? "").trim(),
    );
    if (exotics.length === 0) return;

    const aspects = cleanNames(field(text, "Aspects", ["Fragments"]));
    const fragments = cleanNames(field(text, "Fragments", ["Abilities"]));

    builds.push({
      name: heading.title.replace(/\s+/g, " ").trim(),
      class: field(gearText, "Class", ["Slot"]) || "",
      subclass: inferSubclass(fragments, aspects),
      exotics,
      slot: field(gearText, "Slot", ["Source"]),
      acquisition: field(gearText, "Source", ["Requires"]),
      requires: field(gearText, "Requires", ["Exotic Perk"]),
      aspects,
      fragments,
      abilities: abilityList(
        field(text, "Abilities", ["Stats", "Mods", "Gameplay Loop", "Weapons", "Armor Mods"]),
      ),
      stats: cleanStats(field(text, "Stats", ["Mods"])),
      mods: parseMods(
        field(text, "Mods", FIELDS)
          .split(/Gameplay Loop/i)[0]
          ?.trim() ?? "",
      ),
      url: pageUrl,
    });
  });

  return builds;
}

export async function ingestBlueberriesBuilds() {
  const { db, pool } = createDatabase();

  const pages = [...new Set(PAGE_HINTS.map((hint) => `https://www.blueberries.gg${hint}`))];

  const parsed: ParsedBuild[] = [];
  for (const page of pages) {
    try {
      const html = await fetchPage(page);
      const builds = parseBuildsPage(html, page);
      console.log(`${page} -> ${builds.length} builds`);
      parsed.push(...builds);
    } catch (error) {
      console.log(`${page} -> skipped (${String(error)})`);
    }
    await sleep(DELAY_MS);
  }

  // Later pages win: a build repeated on the class page and the subclass page is one row.
  const unique = new Map<string, ParsedBuild>();
  for (const build of parsed) {
    unique.set(`${build.class}|${build.name}`.toLowerCase(), build);
  }
  const rows = [...unique.values()];

  await db.transaction(async (tx) => {
    await tx.delete(schema.communityBuilds);
    if (rows.length > 0) {
      await tx.insert(schema.communityBuilds).values(
        rows.map((build) => ({
          name: build.name,
          class: build.class,
          subclass: build.subclass,
          exotics: build.exotics,
          slot: build.slot,
          acquisition: build.acquisition,
          requires: build.requires,
          aspects: build.aspects,
          fragments: build.fragments,
          abilities: build.abilities,
          stats: build.stats,
          mods: build.mods.slice(0, 600),
          source: SOURCE,
          sourceUrl: build.url,
          author: AUTHOR,
        })),
      );
    }

    await tx
      .insert(schema.sources)
      .values({
        name: SOURCE,
        url: HUB,
        credit: AUTHOR,
        licenseNote: "Build facts extracted with attribution; article text is not copied.",
      })
      .onConflictDoNothing();
  });

  await pool.end();
  return { pages: pages.length, builds: rows.length };
}
