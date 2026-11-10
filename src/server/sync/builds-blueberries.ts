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
  return KNOWN_STATS.test(value) ? value.trim() : "";
}

const splitList = (value: string): string[] =>
  value
    .replace(/\.$/, "")
    .split(/\s*,\s*|\s+and\s+/i)
    .map((entry) => entry.trim().replace(/\.$/, ""))
    .filter((entry) => entry.length > 0 && entry.length < 60);

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

    const aspects = splitList(field(text, "Aspects", ["Fragments"]));
    const fragments = splitList(field(text, "Fragments", ["Abilities"]));

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
      abilities: splitList(field(text, "Abilities", ["Stats"])),
      stats: cleanStats(field(text, "Stats", ["Mods"])),
      mods:
        field(text, "Mods", FIELDS)
          .split(/Gameplay Loop/i)[0]
          ?.trim() ?? "",
      url: pageUrl,
    });
  });

  return builds;
}

export async function ingestBlueberriesBuilds() {
  const { db, pool } = createDatabase();

  const hub = await fetchPage(HUB);
  const linked = [...hub.matchAll(/href="(https:\/\/www\.blueberries\.gg\/[^"]+)"/g)]
    .map((match) => match[1]!)
    .filter((url) => url.includes("/armor/"));

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
