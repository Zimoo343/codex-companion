# Codex Companion — design

Working codename: `codex-companion`. Product name to be chosen at launch.

Date: 2026-11-04
Status: draft for approval

## Intent

One place to ask a question about Destiny 2 and get an answer a new or returning
player can act on, backed by real data instead of model memory. Numbers come from
community-maintained spreadsheets, item and activity facts come from Bungie's
manifest, and every answer names the rows it used.

The author knows Destiny 2 well enough to grade answers. That is the safety net:
the tool is judged against a human who can tell when it is wrong.

## Why now

Destiny 2's end-of-service announcement and returning vaulted content will bring a
wave of returning and new players. Existing knowledge is spread across Reddit
threads, YouTube videos, five community spreadsheets and a wiki. Nobody has a
single box that answers "what should I use, where does it drop, and is it still
available" with sources.

## Audience and register

- Primary: new and returning players who do not know community jargon.
- Secondary: experienced players who want exact numbers, tier lists and sources.

Both are served by one agent that changes register. Plain language by default,
exact figures and column names on request.

## Goals

- Answer weapon, damage, perk, exotic armor, subclass, raid, dungeon and activity
  questions from structured data, with citations.
- Route the rest honestly. When a question belongs to another tool — live inventory,
  god-roll browsing, player stats, LFG — name that tool and link it instead of
  guessing or refusing flatly.
- Never invent a number. Say "I do not have that" when data is missing.
- Stay current: re-sync when Bungie publishes a new manifest version, and record
  the data date with every answer.
- Be readable as a portfolio repository: clear modules, tests, evals, a live demo.
- Cost bounded and predictable, even though the app is public.

## Non-goals

- Not a build planner, loadout manager or DIM replacement. DIM, D2ArmorPicker,
  light.gg, destiny.report, braytech, raid.report, dungeon.report, trials.report,
  destinytracker and raidhub are good at what they do, and the companion points at
  them rather than competing.
- Not a live inventory tracker requiring Bungie login.
- Not a wiki replacement with hand-written articles.
- Not a link directory. Only tools that genuinely answer a question the companion
  cannot, one recommendation per need.
- No PvP-specific meta coverage in v1.

## Anti-goals

- A confident answer with no source.
- A number that changes silently after a sheet update with no trace.
- A public demo that can run up an unbounded bill.
- Scraping community sites that do not offer an API.

## Constraints

- **Licence: MIT** for the code. Community data is not covered by it: AegisRelic and
  Destiny Data Compendium content stays theirs, credited and linked, never
  redistributed in the repo.
- **Release model: invite-only at launch**, hosted on `*.vercel.app` with an access
  code. Revisit open access once the eval set covers the common questions.
- Data licensing: AegisRelic and Destiny Data Compendium are community work. Credit
  them, link to them, never re-host their sheets in the repo. Cache only derived
  values, keep provenance columns.
- Prose sources: official Bungie announcements through the public Steam news API
  (dated, full text, attributed and linked), and Destinypedia, which is CC-BY-SA —
  store chunks with attribution and a licence notice, never mirror the wiki.
  Third-party press items in the Steam feed are filtered out.
- Bungie API terms: application registration, key server-side only, attribution in
  the UI, no redistribution of raw manifest dumps.
- light.gg returns 403 and has no public API. Do not scrape. Link out.
- Single maintainer. Anything that needs daily hand-holding will rot.
- Windows development machine, public deployment target.

## Approaches considered

**A. Document RAG only.** Embed wiki text and guides, cite chunks. Fast to build.
Rejected: confident wrong numbers, which is the one failure mode that destroys
trust in a numbers tool.

**B. Hybrid structured + text.** Manifest and sheets into a relational database,
prose guides into vector search, model queries the database and cites rows.
Chosen. Proven by the spike: ten graded questions, one wrong answer traced to a
prompt gap, fixed by requiring burst/sustained split and explicit assumptions.

**C. Full agent with live API tools per query.** Inventory, vendors, Xur. Correct
but slow and auth-heavy. Deferred to v1.1 for the small set of genuinely live
questions.

**Framework choice: eve vs hand-rolled AI SDK.** eve gives tools, cron schedules,
channels and an eval harness as first-class features, which are exactly the pieces
this project needs and hobby RAG projects skip. Accepted risk: it is a release
candidate. Mitigation: all data access sits behind own modules, so tools are thin
wrappers and can move to plain AI SDK without rewriting logic.

## Architecture

**Stack (my calls, reversible):** Next.js App Router, TypeScript, tRPC for the app
API, Postgres with pgvector on Neon, Drizzle for schema and migrations, eve for the
agent runtime, Tailwind for UI. Deployed on Vercel. Chosen because it is boring,
well documented, free at this scale, and matches the author's existing style guide.

**Agent tools**

- `query_game_data` — read-only SQL over the structured tables. Single statement,
  allowlist of `select`/`with`, row cap, timeout.
- `search_guides` — vector search over prose chunks with source, section and date
  metadata. Used for "why", "how does X work", "what changed" and anything the
  tables cannot answer.
- Later: `get_weekly_rotation`, `get_vendor_stock`, `get_current_artifact`.

**Retrieval order.** Structured data answers facts and numbers; prose answers
context and change history. The agent decides per question, and an answer may cite
both: a weapon row from the tables with a patch note explaining the recent change.
If the tables and the notes disagree, the newer date wins and the answer says so.

**Data model (v1)**

- `sources` — source id, name, url, credit text, license note, last fetched.
- `sync_runs` — manifest version, started, finished, row counts, diff summary.
- `weapons`, `armor`, `subclass_plugs`, `activities` — manifest-derived, as in the spike.
- `aegis_weapons`, `aegis_archetypes` — derived sheet rows with `source_id` and
  `retrieved_at`.
- `guides` — prose chunks with embedding, url, title, section, published date,
  source id, licence note. One row per chunk, Postgres `vector` column, HNSW index.
- `external_tools` — name, url, what it answers, when to recommend it, last
  reviewed. Static, checked into the repo, small and curated by hand.
- `corrections` — reported wrong answers: question, answer, note, status.
- `eval_runs`, `eval_results` — question, expected, graded outcome, model, date.

**Sync pipeline.** A Node script, not a serverless route: fetch manifest, unzip,
compare version against `sync_runs`, skip if unchanged, otherwise rebuild tables in
a transaction and record counts. Run from GitHub Actions on a schedule. Sheets are
pulled by header mapping; a missing expected column fails the run loudly rather
than writing nulls.

Guide ingestion runs separately and incrementally: fetch new official announcements
from the Steam news API, chunk by heading, embed, upsert by URL and section hash so
unchanged text is never re-embedded. Wiki pages are ingested per topic, not by full
dump.

**Handoffs.** The companion covers knowledge: what exists, what the numbers are,
what changed, where something drops. It does not cover the player's own account or
live state. For those it hands off with a link:

| question | hand off to |
|---|---|
| god rolls, weapon versions, craftable or upgradable status, sources | destiny.report |
| item popularity, weekly rotation, vendor stock | light.gg |
| my vault, loadouts, gear transfers | DIM |
| best armor stat split from what I own | d2armorpicker.com |
| my progress, collections, vendors, season status | braytech.org |
| my career stats, PvP and PvE breakdowns | destinytracker.com |
| my raid and dungeon clears, leaderboards | raid.report, dungeon.report |
| Trials performance | trials.report |
| finding a fireteam for a raid or dungeon | raidhub.io |

A handoff is one sentence plus the link, never a list. If a question needs a tool
that is not on the list, say the companion does not cover it and stop there.

**Freshness.** Every answer states the manifest version and sheet retrieval date,
and says how old the data is when older than the current season.

**Register switching.** Default answers are plain-language. A `tech` toggle, or an
explicit request for numbers, switches to exact figures with column names and
assumptions.

## Evals

Seed corpus: the ten spike questions plus damage-math, armor, subclass, activity,
handoff and refusal cases, ~30 total. Each has an expected answer, an expected
handoff target, or an expected refusal.

Run on every prompt, tool or schema change. Grading is manual for numeric answers
and LLM-as-judge for phrasing. A regression blocks deployment. `eve eval` provides
the harness; results land in `eval_runs` so the history is visible in the repo.

## Security and cost

- Service-account API key with a model-request permission only, in env, never in
  the client bundle.
- Per-IP rate limit and a hard daily spend cap enforced in code, plus a second cap
  in the provider console. Two independent limits, because one always gets missed.
- SQL tool is read-only against a database user with no write grants.
- Public demo key is separate from any key used by the sync job.

## v1 scope

Ship: invite-only chat UI, cited answers over weapons, damage math, exotic armor,
subclass plugs and activities, **vector search over official announcements and
Destinypedia**, data freshness display, feedback button, evals, README with demo
link, data credits, MIT licence.

Not in v1: live vendors and rotation, builds, DLC and free-to-play answers,
accounts, Discord channel, Path of Exile 2.

## Later

1. Live tools: weekly rotation, Xur, vendor stock, current Eververse. Each one
   retires a handoff, so the tool list shrinks as coverage grows. Needs application
   registration and public vendor endpoints, no user auth.
2. Builds: curated by the author or sourced from community builders with credit.
3. Additional games: a `game` column on sources, guides and derived tables exists
   from day one, so a second game is data work, not a rewrite. Path of Exile 2 is
   out of scope for this document; the codename is deliberately game-neutral so a
   second game can be added without renaming anything.
4. Discord channel through eve channels, if the web demo gets use.
5. Hybrid keyword plus vector ranking if plain vector search misses exact terms
   like perk names.

## Decided

- Repository and codename: `codex-companion`, game-neutral on purpose.
- Code licence: MIT.
- Launch: invite-only on Vercel.
- Path of Exile 2: out of scope, possible later.
- Data access behind own modules so the agent framework stays replaceable.
- v1 includes vector search: official Bungie announcements via the Steam news API,
  plus Destinypedia under CC-BY-SA.
- Embeddings: OpenAI `text-embedding-3-small`, separate key.
- Storage: pgvector in the same Postgres database, HNSW index, cosine distance.
- Handoffs: a small curated `external_tools` table, checked into the repo, one
  recommendation per need.

## What is left to the builder

- Exact table columns and indexes, including vector dimensions and chunk size.
- Prompt text, tool schemas and refusal phrasing.
- UI layout and citation rendering.
- CI setup for sync and evals.
- Guide chunking strategy per source type, and how much wiki coverage is worth the
  ingestion effort.
- Which external tools to seed first, and how to keep the handoff wording from
  sounding like an ad.
