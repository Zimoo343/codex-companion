import { inArray, or, eq } from "drizzle-orm";
import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { buildChunks, type ChunkOptions } from "./chunk.ts";
import { contentHash, createOpenAiEmbeddings } from "./embed.ts";

const API = "https://www.destinypedia.com/api.php";
const SOURCE_NAME = "Destinypedia";
const LICENSE_NOTE = "Destinypedia, CC BY-SA 4.0. Linked, not mirrored.";
const USER_AGENT = "codex-companion/0.1 (personal Destiny 2 companion; contact: local)";

type ParseResponse = {
  parse?: { title?: string; text?: string };
  error?: { code?: string; info?: string };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function wikiUrl(title: string): string {
  return `https://www.destinypedia.com/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

// Concept pages first, because a player asking "how do champions work" needs these
// far more than a specific gun. Then gear and endgame pages from our own data.
const CONCEPT_PAGES = [
  // Titles verified against the wiki's search API; guessed names 404.
  "Champion",
  "Mods",
  "Weapon",
  "Weapon Crafting",
  "Elemental damage",
  "Subclass",
  "Fragment",
  "Raid",
  "Dungeon",
  "Strike",
  "Nightfall",
  "Lost Sector",
  "Artifact",
  "Eververse",
  "Engram",
];

// Seed pages come from the data we already trust: exotic gear and endgame
// activities. Those are the pages players ask about, and it keeps the crawl
// bounded instead of mirroring the wiki.
export async function selectSeedPages(limit: number): Promise<string[]> {
  const { db, pool } = createDatabase();

  const exoticWeapons = await db
    .select({ name: schema.weapons.name })
    .from(schema.weapons)
    .where(eq(schema.weapons.tier, "Exotic"));
  const exoticArmor = await db.select({ name: schema.armor.name }).from(schema.armor);
  const endgame = await db
    .select({ name: schema.activities.name })
    .from(schema.activities)
    .where(or(eq(schema.activities.type, "Raid"), eq(schema.activities.type, "Dungeon")));

  await pool.end();

  // Order matters: the limit cuts from the end, and endgame pages are what people
  // ask about most. Gear comes after activities, weapons last.
  const names = new Set<string>(CONCEPT_PAGES);
  for (const row of [...endgame, ...exoticArmor, ...exoticWeapons]) {
    names.add(row.name.trim());
  }

  return [...names].filter(Boolean).slice(0, limit);
}

// Wiki titles are not always our names: "Duality" is "Duality (dungeon)" there.
// For a miss, ask the wiki's own search and accept a result that starts with our name.
async function resolveTitle(title: string): Promise<string | null> {
  const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(title)}&srlimit=5&format=json&formatversion=2`;
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return null;

  const body = (await response.json()) as { query?: { search?: Array<{ title: string }> } };
  const candidates = body.query?.search ?? [];
  const match = candidates.find((candidate) =>
    candidate.title.toLowerCase().startsWith(title.toLowerCase()),
  );
  return match?.title ?? null;
}

export async function fetchWikiPage(
  title: string,
): Promise<{ pageTitle: string; html: string } | null> {
  const parse = async (pageTitle: string) => {
    const url = `${API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json&formatversion=2&redirects=1`;
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) return null;
    const body = (await response.json()) as ParseResponse;
    if (!body.parse?.text) return null;
    if (/may refer to:/i.test(body.parse.text.slice(0, 400))) return null;
    return body.parse.text;
  };

  const direct = await parse(title);
  if (direct) return { pageTitle: title, html: direct };

  const resolved = await resolveTitle(title);
  if (!resolved) return null;

  // Keep the wiki's own title: "Duality" (an Exotic shotgun) and
  // "Duality (dungeon)" are different pages and must not be merged.
  const html = await parse(resolved);
  return html ? { pageTitle: resolved, html } : null;
}

export type WikiIngestResult = {
  pages: number;
  missing: number;
  chunks: number;
  embedded: number;
  skipped: number;
};

export async function ingestWiki(
  options: ChunkOptions & { limit?: number; dryRun?: boolean } = {},
): Promise<WikiIngestResult> {
  const { db, pool } = createDatabase();
  const titles = await selectSeedPages(options.limit ?? 300);

  const pending: Array<typeof schema.guides.$inferInsert> = [];
  let pages = 0;
  let missing = 0;

  for (const [index, title] of titles.entries()) {
    const page = await fetchWikiPage(title);
    if (!page) {
      missing++;
      continue;
    }
    pages++;

    for (const chunk of buildChunks(page.pageTitle, page.html, options)) {
      if (chunk.content.split(/\s+/).length < 25) continue;
      pending.push({
        sourceName: SOURCE_NAME,
        url: wikiUrl(page.pageTitle),
        title: page.pageTitle,
        section: chunk.section,
        licenseNote: LICENSE_NOTE,
        contentHash: contentHash(
          SOURCE_NAME,
          wikiUrl(page.pageTitle),
          chunk.section,
          chunk.content,
        ),
        content: chunk.content,
      });
    }

    if (index % 25 === 0) console.log(`fetched ${index + 1}/${titles.length} pages`);
    await sleep(150);
  }

  const known = new Set<string>();
  const hashes = pending.map((row) => row.contentHash);
  for (let index = 0; index < hashes.length; index += 500) {
    const slice = hashes.slice(index, index + 500);
    const rows = await db
      .select({ hash: schema.guides.contentHash })
      .from(schema.guides)
      .where(inArray(schema.guides.contentHash, slice));
    for (const row of rows) known.add(row.hash);
  }

  const fresh = pending.filter((row) => !known.has(row.contentHash));

  if (options.dryRun) {
    await pool.end();
    return {
      pages,
      missing,
      chunks: pending.length,
      embedded: 0,
      skipped: pending.length - fresh.length,
    };
  }

  const provider = createOpenAiEmbeddings();
  let embedded = 0;

  for (let index = 0; index < fresh.length; index += 100) {
    const batch = fresh.slice(index, index + 100);
    const vectors = await provider.embed(batch.map((row) => row.content));
    await db
      .insert(schema.guides)
      .values(batch.map((row, position) => ({ ...row, embedding: vectors[position] ?? null })))
      .onConflictDoNothing();
    embedded += batch.length;
    console.log(`embedded ${embedded}/${fresh.length}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.sources)
      .values({
        name: SOURCE_NAME,
        url: "https://www.destinypedia.com/",
        credit: "Destinypedia contributors",
        licenseNote: LICENSE_NOTE,
      })
      .onConflictDoNothing();

    await tx.insert(schema.syncRuns).values({
      kind: "guides-wiki",
      version: new Date().toISOString().slice(0, 10),
      status: "ok",
      detail: { pages, missing, chunks: pending.length, embedded },
      finishedAt: new Date(),
    });
  });

  await pool.end();
  return {
    pages,
    missing,
    chunks: pending.length,
    embedded,
    skipped: pending.length - fresh.length,
  };
}
