import { inArray } from "drizzle-orm";
import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { buildEntityDocuments } from "./entity-docs.ts";
import { createOpenAiEmbeddings } from "./embed.ts";

export type EntityIngestResult = {
  documents: number;
  embedded: number;
  skipped: number;
  removed: number;
};

export async function ingestEntities(
  options: { dryRun?: boolean } = {},
): Promise<EntityIngestResult> {
  const { db, pool } = createDatabase();

  const documents = await buildEntityDocuments();
  const hashes = documents.map((document) => document.contentHash);

  const known = new Set<string>();
  for (let index = 0; index < hashes.length; index += 500) {
    const slice = hashes.slice(index, index + 500);
    const rows = await db
      .select({ hash: schema.entities.contentHash })
      .from(schema.entities)
      .where(inArray(schema.entities.contentHash, slice));
    for (const row of rows) known.add(row.hash);
  }

  const fresh = documents.filter((document) => !known.has(document.contentHash));

  // Entities that no longer exist upstream (removed perks, renamed activities) must
  // not linger in retrieval, so anything not in this run is deleted.
  const stale =
    hashes.length === 0
      ? []
      : (
          await db
            .select({ id: schema.entities.id, hash: schema.entities.contentHash })
            .from(schema.entities)
        )
          .filter((row) => !hashes.includes(row.hash))
          .map((row) => row.id);

  if (options.dryRun) {
    await pool.end();
    return { documents: documents.length, embedded: 0, skipped: known.size, removed: stale.length };
  }

  const provider = createOpenAiEmbeddings();
  let embedded = 0;

  for (let index = 0; index < fresh.length; index += 100) {
    const batch = fresh.slice(index, index + 100);
    const vectors = await provider.embed(batch.map((document) => document.text));
    await db
      .insert(schema.entities)
      .values(
        batch.map((document, position) => ({
          kind: document.kind,
          name: document.name,
          text: document.text,
          meta: document.meta,
          contentHash: document.contentHash,
          embedding: vectors[position] ?? null,
        })),
      )
      .onConflictDoNothing();
    embedded += batch.length;
    console.log(`embedded ${embedded}/${fresh.length}`);
  }

  for (let index = 0; index < stale.length; index += 500) {
    await db
      .delete(schema.entities)
      .where(inArray(schema.entities.id, stale.slice(index, index + 500)));
  }

  await db.insert(schema.syncRuns).values({
    kind: "entities",
    version: new Date().toISOString().slice(0, 10),
    status: "ok",
    detail: {
      documents: documents.length,
      embedded,
      skipped: known.size,
      removed: stale.length,
    },
    finishedAt: new Date(),
  });

  await pool.end();
  return { documents: documents.length, embedded, skipped: known.size, removed: stale.length };
}
