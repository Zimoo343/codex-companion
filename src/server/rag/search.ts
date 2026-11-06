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
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
};

const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
const RANK_CANDIDATES = 40;
const RRF_K = 60;

// Hybrid retrieval. Vector search finds paraphrase; keyword search finds exact
// names like "Duality" or "Bait and Switch", which embeddings routinely lose to a
// generic page. The two rankings are merged with reciprocal rank fusion:
// score = 1/(k + rank_vector) + 1/(k + rank_keyword).
const HYBRID_SQL = `
  with q as (
    select $1::vector as vec, websearch_to_tsquery('english', $4) as tsq
  ),
  vector_ranked as (
    select g.id, row_number() over (order by g.embedding <=> q.vec) as rank_vector
      from guides g, q
     where g.embedding is not null and g.era <> 'd1'
     order by g.embedding <=> q.vec
     limit ${RANK_CANDIDATES}
  ),
  keyword_ranked as (
    select g.id, row_number() over (order by ts_rank(g.content_tsv, q.tsq) desc) as rank_keyword
      from guides g, q
     where g.content_tsv @@ q.tsq and g.era <> 'd1'
     order by ts_rank(g.content_tsv, q.tsq) desc
     limit ${RANK_CANDIDATES}
  ),
  merged as (
    select coalesce(v.id, k.id) as id,
           coalesce(v.rank_vector, null) as rank_vector,
           coalesce(k.rank_keyword, null) as rank_keyword,
           coalesce(1.0 / (${RRF_K} + v.rank_vector), 0)
             + coalesce(1.0 / (${RRF_K} + k.rank_keyword), 0) as score
      from vector_ranked v
      full join keyword_ranked k on k.id = v.id
  )
  select g.id, g.title, g.section, g.url, g.source_name as "sourceName",
         g.license_note as "licenseNote", g.published_at as "publishedAt", g.content,
         m.score::float8 as score, m.rank_vector::int as "vectorRank", m.rank_keyword::int as "keywordRank",
         row_number() over (partition by g.title order by m.score desc) as position
    from merged m
    join guides g on g.id = m.id
   order by m.score desc
   limit 200
`;

export async function embedQuestion(query: string): Promise<number[]> {
  const provider = createOpenAiEmbeddings();
  const [vector] = await provider.embed([query]);
  if (!vector) throw new Error("embedding returned no vector");
  return vector;
}

export async function searchGuides(query: string, limit = 8, maxPerTitle = 2): Promise<GuideHit[]> {
  return searchGuidesByVector(await embedQuestion(query), query, limit, maxPerTitle);
}

export async function searchGuidesByVector(
  vector: number[],
  query: string,
  limit = 8,
  maxPerTitle = 2,
): Promise<GuideHit[]> {
  const { pool } = createDatabase();
  try {
    const result = await pool.query<GuideHit & { position: number }>(
      `select * from (${HYBRID_SQL}) ranked where position <= $3 order by score desc limit $2`,
      [toVectorLiteral(vector), limit, maxPerTitle, query],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export type EntityHit = {
  id: number;
  kind: string;
  name: string;
  text: string;
  meta: Record<string, string>;
  score: number;
};

// Semantic search over every game entity. The returned text is a rendering of the
// row; the answer still quotes the structured columns behind it.
export async function searchEntities(vector: number[], limit = 6): Promise<EntityHit[]> {
  const { pool } = createDatabase();
  try {
    const result = await pool.query<EntityHit>(
      `select id, kind, name, text, meta, (1 - (embedding <=> $1::vector))::float8 as score
         from entities
        where embedding is not null
        order by embedding <=> $1::vector
        limit $2`,
      [`[${vector.join(",")}]`, limit],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}
