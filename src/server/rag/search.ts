import { createDatabase } from "../db/client.ts";
import { createOpenAiEmbeddings } from "./embed.ts";

export type GuideHit = {
  id: number;
  title: string;
  section: string;
  url: string;
  sourceName: string;
  licenseNote: string;
  publishedAt: Date | null;
  content: string;
  similarity: number;
};

const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

// Cosine distance with the HNSW index. The index only helps when ordering by the
// distance operator itself, so the ORDER BY stays on `<=>`.
// A long page can fill every slot with near-identical chunks, so results are capped
// per title: two chunks from one page at most.
export async function searchGuides(query: string, limit = 8, maxPerTitle = 2): Promise<GuideHit[]> {
  const provider = createOpenAiEmbeddings();
  const [vector] = await provider.embed([query]);
  if (!vector) throw new Error("embedding returned no vector");

  const { pool } = createDatabase();
  try {
    const result = await pool.query<GuideHit>(
      `with ranked as (
         select id, title, section, url, source_name, license_note, published_at, content,
                1 - (embedding <=> $1::vector) as similarity,
                row_number() over (partition by title order by embedding <=> $1::vector) as position
           from guides
          where embedding is not null
       )
       select id, title, section, url, source_name as "sourceName",
              license_note as "licenseNote", published_at as "publishedAt",
              content, similarity
         from ranked
        where position <= $3
        order by similarity desc
        limit $2`,
      [toVectorLiteral(vector), limit, maxPerTitle],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}
