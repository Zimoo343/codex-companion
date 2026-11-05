# RAG notes

Working notebook for the retrieval half of the project. Numbers here come from runs
on the real corpus, not estimates.

## Pipeline

1. **Fetch** — official announcements from Steam's news API (`appid 1085660`), wiki
   pages from Destinypedia's MediaWiki API (`action=parse`, HTML).
2. **Clean** — Steam sends BBCode, the wiki sends HTML; both are converted to text
   with `## ` heading markers.
3. **Split** — sections are cut at headings, then each section is windowed into
   chunks of **220 words with 40 words of overlap**.
4. **Embed** — `text-embedding-3-small`, 1536 dimensions, batches of 64.
5. **Store** — Postgres `vector(1536)`, HNSW index with `vector_cosine_ops`, hash
   unique per chunk so re-ingesting unchanged text embeds nothing.
6. **Retrieve** — embed the question, order by `embedding <=> query`, keep **8**
   results, cap **2 per page title**.
7. **Answer** — the chat model sees the numbered chunks only, must cite `[n]`, and
   must say when the sources do not answer.

## Eval results

Twenty questions in `evals/questions.json`, scored on retrieval only: did the
expected page appear in the top 8. Answers are graded by hand afterwards.

| run | change | hit@8 |
|---|---|---|
| baseline | vector only | 14/20 (70%) |
| coverage | raids and dungeons seeded before weapons, 322 pages | 18/20 (90%) |
| hybrid | vector + keyword with reciprocal rank fusion | 19/20 (95%) |

The coverage jump is the important one. Six of the original failures were pages
that had never been ingested because the seed list was alphabetical and the limit
cut from the end. Retrieval cannot find what is not there.

Remaining failure: "what exotic helmet does a hunter use for survivability" does not
retrieve Assassin's Cowl. No keyword overlap; the page never uses "survivability".
Structured data already knows it is a Hunter helmet with an exotic perk, which is a
job for the agent in Phase 3, not for the index.

## Corpus as of 2026-11-05

| source | pages | chunks |
|---|---|---|
| Destinypedia | 235 | 5253 |
| Steam official announcements | 73 | 91 |

Cost to embed all of it: about **$0.03**, at $0.02 per million tokens.

## What the runs taught us

**Hybrid beats vector alone on exact names.** "What is the duality dungeon" put the
generic `Dungeon` page first at 0.496 similarity while the `Duality` page sat just
outside the top results. Adding a `tsvector` column with a GIN index and fusing both
rankings with reciprocal rank fusion moved the exact page into the top three.

**RRF is not a boost.** A chunk ranked high in both lists beats a chunk ranked first
in one list and absent from the other. That is why "Heartshadow" outranks "Duality"
for the dungeon query: it appears in both rankings. It is acceptable here, and a
title-match boost is the next thing to test if it stops being acceptable.

**Wiki titles collide.** "Duality" is an Exotic shotgun and "Duality (dungeon)" is a
raid activity. Storing the seed name as the title merged both pages into one and the
model answered about the shotgun. The importer now keeps the resolved wiki title.

**New OpenAI accounts are rate limited at 1M tokens per minute.** A full re-ingest
died at 2000 chunks with a 429. The embedder now honours `retry-after` and backs off,
which is what a production ingest job needs anyway.


**Seed coverage beats algorithm tuning.** The first wiki crawl seeded pages from our
own gear and activity data. Asking "how do champions work" returned exotic armor at
0.43 similarity and the model correctly said it could not answer. Adding a short list
of concept pages — Champion, Mods, Elemental damage, Subclass — moved the right page
to 0.669 and the answer became correct. Same chunker, same model, same index.

**Guessed wiki titles 404.** Fifteen of twenty-six concept titles I invented do not
exist ("Damage type", "Armor mod", "Status effect"). The wiki's search API is the
cheap way to find real titles: "damage type" resolves to "Elemental damage".

**One long page fills the whole result list.** Before the per-title cap, four of eight
slots were Anarchy. One page with many similar chunks drowns every other source.
Two-per-title is a blunt instrument but it fixed the visible symptom.

**Steam announces, it does not patch-note.** Most official posts are short marketing
entries; the long patch notes are linked out to bungie.net, whose article pages return
a JavaScript shell to non-browser clients. So the announcement corpus is thin by
nature: 73 posts, 91 chunks. Current sandbox facts will have to come from the
spreadsheets, not from prose.

**The wiki spans Destiny 1 and Destiny 2 and is often stale.** Asked how to get
Gjallarhorn, retrieval worked perfectly (0.662) and the answer was about Rise of Iron,
because the page mixes eras. Retrieval quality and answer correctness are separate
problems; this is the second one.

**Markup differs per source.** Steam sends BBCode (`[p]`, `[h2]`, `[url=…]`), the wiki
sends HTML. Handling only HTML silently produced 91 chunks from 77 posts instead of
roughly 1000, because nothing was being split at headings.

## Parameters and why

- **220 words / 40 overlap** — roughly 300 tokens, small enough that a precise answer
  is not diluted, large enough that patch-note context survives. Untested alternatives:
  120/20 for patch notes, 350/60 for wiki overview pages.
- **top-k 8** — enough to cover a definition plus examples, few enough to stay inside
  a cheap model's attention.
- **cosine distance** — embeddings are normalized, so cosine and inner product agree;
  cosine is what the HNSW operator class expects.
- **Hash on source + url + section + content** — re-running ingestion embeds only
  changed text.

## Next experiments, in order of expected value

1. **Recency boost.** Wiki text has no reliable date, but announcements do. Try a
   scoring tweak: `similarity + 0.05` for sources published in the last 90 days, and
   measure on the eval set rather than by feel.
2. **Hybrid search for perk names.** Vector search fumbles exact tokens like
   "Bait and Switch". `pg_trgm` or a `tsvector` column with reciprocal rank fusion is
   the usual fix.
3. **Chunk size by source type.** Patch notes likely want smaller chunks than wiki
   overview pages.
4. **Query rewriting.** "best dps" is ambiguous even to humans; rewriting it into
   "burst damage per second heavy weapon" before retrieval may help more than any
   index tuning.
5. **Reranking.** Cross-encoder rerank of top 30 down to 8, if the free options are
   good enough on CPU.

Each experiment needs eval questions before it, otherwise "feels better" wins and the
project learns nothing.
