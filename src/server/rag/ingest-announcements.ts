import { inArray } from "drizzle-orm";
import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { buildChunks, type ChunkOptions } from "./chunk.ts";
import { contentHash, createOpenAiEmbeddings } from "./embed.ts";

const STEAM_NEWS_URL =
  "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1085660&count=200&maxlength=0";

const SOURCE_NAME = "Steam official Destiny 2 announcements";
const SOURCE_URL = "https://store.steampowered.com/news/app/1085660";
const LICENSE_NOTE =
  "Official Bungie announcements, published through Steam. Linked, not mirrored.";

type SteamNewsItem = {
  gid: string;
  title: string;
  url: string;
  contents: string;
  date: number;
  feedname: string;
  feedlabel: string;
};

// The Steam news feed mixes Bungie's own posts with third-party press. Only the
// official announcements belong in the corpus.
export async function fetchAnnouncements(): Promise<SteamNewsItem[]> {
  const response = await fetch(STEAM_NEWS_URL);
  if (!response.ok) throw new Error(`steam news failed: ${response.status}`);

  const body = (await response.json()) as { appnews: { newsitems: SteamNewsItem[] } };
  const seen = new Set<string>();

  return body.appnews.newsitems.filter((item) => {
    if (item.feedname !== "steam_community_announcements") return false;
    if (seen.has(item.gid)) return false;
    seen.add(item.gid);
    return item.contents.length > 200;
  });
}

export type IngestResult = { documents: number; chunks: number; embedded: number; skipped: number };

export async function ingestAnnouncements(
  options: ChunkOptions & { dryRun?: boolean } = {},
): Promise<IngestResult> {
  const { db, pool } = createDatabase();

  const announcements = await fetchAnnouncements();
  const pending: Array<typeof schema.guides.$inferInsert> = [];
  let skipped = 0;

  for (const announcement of announcements) {
    const chunks = buildChunks(announcement.title, announcement.contents, options).filter(
      (chunk) => chunk.content.split(/\s+/).length >= 25,
    );

    for (const chunk of chunks) {
      const hash = contentHash(SOURCE_NAME, announcement.url, chunk.section, chunk.content);
      pending.push({
        sourceName: SOURCE_NAME,
        url: announcement.url,
        title: chunk.title,
        section: chunk.section,
        licenseNote: LICENSE_NOTE,
        publishedAt: new Date(announcement.date * 1000),
        contentHash: hash,
        content: chunk.content,
      });
    }
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
  skipped = pending.length - fresh.length;

  if (options.dryRun) {
    await pool.end();
    return { documents: announcements.length, chunks: pending.length, embedded: 0, skipped };
  }

  const provider = createOpenAiEmbeddings();
  let embedded = 0;

  for (let index = 0; index < fresh.length; index += 100) {
    const batch = fresh.slice(index, index + 100);
    const vectors = await provider.embed(batch.map((row) => row.content));

    const rows = batch.map((row, position) => ({ ...row, embedding: vectors[position] ?? null }));
    await db.insert(schema.guides).values(rows).onConflictDoNothing();
    embedded += rows.length;
    console.log(`embedded ${embedded}/${fresh.length}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.sources)
      .values({ name: SOURCE_NAME, url: SOURCE_URL, credit: "Bungie", licenseNote: LICENSE_NOTE })
      .onConflictDoNothing();

    await tx.insert(schema.syncRuns).values({
      kind: "guides",
      version: new Date().toISOString().slice(0, 10),
      status: "ok",
      detail: { documents: announcements.length, chunks: pending.length, embedded, skipped },
      finishedAt: new Date(),
    });
  });

  await pool.end();
  return { documents: announcements.length, chunks: pending.length, embedded, skipped };
}
