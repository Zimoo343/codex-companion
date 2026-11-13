import { inArray } from "drizzle-orm";
import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import articles from "../data/bungie-articles.json" with { type: "json" };
import { buildChunks, type ChunkOptions } from "./chunk.ts";
import { contentHash, createOpenAiEmbeddings } from "./embed.ts";

const SOURCE_NAME = "Bungie official news";
const SOURCE_URL = "https://www.bungie.net/7/en/News";
const LICENSE_NOTE =
  "Official Bungie articles. Quoted excerpts with a link back to the source, not mirrored.";

type Article = { slug: string; title: string; url: string; publishedAt: string };

// The article pages are client-rendered, so the plain text is read through a reader
// proxy at ingest time. The stored chunks carry the bungie.net URL, not the proxy one.
const READER = "https://r.jina.ai/";

export async function fetchArticle(article: Article): Promise<string> {
  const response = await fetch(`${READER}${article.url}`, {
    headers: { "User-Agent": "codex-companion/1.0" },
  });
  if (!response.ok) throw new Error(`${article.slug} failed: ${response.status}`);

  const raw = await response.text();
  return raw
    .replace(/^Title:.*$/m, "")
    .replace(/^URL Source:.*$/m, "")
    .replace(/^Published Time:.*$/m, "")
    .replace(/^Markdown Content:\s*$/m, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ArticleIngestResult = {
  documents: number;
  chunks: number;
  embedded: number;
  skipped: number;
};

export async function ingestArticles(
  options: ChunkOptions & { dryRun?: boolean } = {},
): Promise<ArticleIngestResult> {
  const { db, pool } = createDatabase();
  const pending: Array<typeof schema.guides.$inferInsert> = [];

  for (const article of articles as Article[]) {
    const text = await fetchArticle(article);
    if (text.length < 500) throw new Error(`${article.slug} returned too little text`);

    // Bungie writes the title in the body as well; drop the duplicate heading.
    const body = text.startsWith(article.title) ? text.slice(article.title.length) : text;
    const chunks = buildChunks(article.title, body, options).filter(
      (chunk) => chunk.content.split(/\s+/).length >= 25,
    );

    for (const chunk of chunks) {
      pending.push({
        sourceName: SOURCE_NAME,
        url: article.url,
        title: chunk.title,
        section: chunk.section,
        licenseNote: LICENSE_NOTE,
        publishedAt: new Date(`${article.publishedAt}T00:00:00Z`),
        contentHash: contentHash(SOURCE_NAME, article.url, chunk.section, chunk.content),
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
  const skipped = pending.length - fresh.length;

  if (options.dryRun) {
    await pool.end();
    return { documents: articles.length, chunks: pending.length, embedded: 0, skipped };
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
      detail: { documents: articles.length, chunks: pending.length, embedded, skipped },
      finishedAt: new Date(),
    });
  });

  await pool.end();
  return { documents: articles.length, chunks: pending.length, embedded, skipped };
}
