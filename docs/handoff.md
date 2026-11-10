# Handoff — Codex Companion

Last updated: 2026-11-09. Read this first in a new session, then the design and plan under
`docs/superpowers/`.

## What this is

A Destiny 2 knowledge companion: a chat that answers from ingested game data and community
sources, cites what it used, and refuses what it cannot support. Public repo:
`github.com/Zimoo343/codex-companion`. Live: invite-only on Vercel, same Neon database as local.

## Working rules for the agent (non-negotiable)

- **Do not commit or push without explicit approval.** User says "commit" or "push".
- **Do not write to the database without asking.** Re-syncs and re-ingests included.
- **Use the edit tool for multi-file changes.** Small node scripts with a shared `path`
  variable corrupted `context.ts` three times by writing the wrong file's contents into it.
- **Run typecheck, tests and build before asking to commit.**
- Never present invented stat orders, popularity claims or prices. See "Policies" below.

## Stack

Next.js app router on Vercel, Neon Postgres with pgvector, Drizzle migrations, OpenAI
`text-embedding-3-small` for embeddings, OpenCode (`gpt-5.4-mini`, Gemini fallback) for chat,
plain SQL and hand-rolled resolvers instead of an agent framework.

```
pnpm run dev            # localhost:3000
pnpm sync               # manifest + sheets + reference data
pnpm sync builds        # Blueberries.gg community builds
pnpm sync classitems    # AegisRelic class items and builds
pnpm ingest announcements | wiki | entities
pnpm eval               # retrieval hit@8
pnpm test               # 55 unit tests
node --env-file=.env.local scripts/inspect.mjs search "best rocket"
```

## Data model as of now

| table | rows | what |
|---|---|---|
| `entities` | 4,296 | embedded text per weapon, armour, plug, activity, class item, set, build, expansion, recommendation, damage frame |
| `sheet_rows` | 2,657 | DDC + AegisRelic raw rows, tab-aware |
| `weapons` | 1,318 | manifest stats, perks, `source`, `access` |
| `aegis_weapons` / `aegis_archetypes` | 748 / 94 | tiers, recommended perks, damage math |
| `subclass_plugs` | 331 | aspects, fragments, artifact perks |
| `guides` | 259 | 168 Destinypedia mechanics chunks + 91 announcements |
| `activities` | 214 | raids, dungeons, strikes, lost sectors |
| `class_item_combos` | 192 | Spirit pairings |
| `armor` / `armor_sets` | 141 / 56 | exotics with perks, set bonuses |
| `community_builds` | 33 (28 with stats) | Blueberries.gg builds across class and subclass |
| `builds` | 9 | AegisRelic class-item builds |
| `expansions` | 10 | 9 releases + The Collection bundle |
| `external_tools` | 10 | handoff links (DIM, destiny.report, light.gg, raid.report…) |

## Query path (one question)

1. Guard: invite code, length, injection tripwire, per-IP daily quota — before any model call.
2. Embed the question once.
3. Hybrid retrieval over `guides`: vector top 40 + `tsvector` top 40, fused with RRF, 2 per
   title, relevance gate, top 5.
4. Structured resolvers in parallel: weapon families and damage tables, named entities, sheet
   rows by tab, rotations, exotic weapons (slot-aware), class items, armour for class, armour
   sets, expansions, acquisition, accessible weapons, community builds, stat mechanics.
5. Context assembly: GAME DATA, ENTITY DATA, WIKI SOURCES, recent turns, `<player_question>`.
6. One streaming model call.
7. NDJSON deltas to the browser; references collapsed behind a button; manifest version footer.

## Policies (and why)

- **Access labels.** `weapons.access` / `armor.access`: free, event, seasonal, archive,
  expansion, raid, dungeon, unknown. Derived from drop source, enriched from the AegisRelic
  sheet. `free` requires a known current source, so vaulted content is `unknown`.
  Archive items are never described as free.
- **Accessibility questions** answer from an obtainable, tiered list and withhold the
  frame-level damage tables, because a top frame may only exist on raid weapons. Ammo must
  match the question: heavy questions never list special or primary.
- **Retired armour stats.** Post-Edge-of-Fate stats are Health, Melee, Grenade, Super, Class,
  Weapons, 0-200; up to 100 is cooldown and regeneration, above 100 is damage. Pre-rework
  names (Mobility, Resilience, Recovery, Discipline, Intellect, Strength) are **never
  translated** and **no stat order is composed**. A build states its current priority or the
  answer says none is stated. Stat mechanics come from the DDC Game Mechanics tab and are only
  fetched for mechanics questions. Two attempts at inferring orders produced wrong advice
  (Health over Melee for a melee build), which is why the rule is absolute.
- **DLC ownership** is resolved in SQL against `expansions`, never inferred by the model.
  The Collection is a bundle: an option, never an owner, never priced.
- **Acquisition** uses Bungie's collectible `Source:` strings verbatim. Strings that reference
  removed content (Gambit Prime, Black Armory, Leviathan) are flagged historical. Strings like
  "Random Perks: cannot be reacquired" are ignored.
- **Builds** are described by subclass, class and exotic; the guide's own name appears only in
  parentheses. Most of the community does not name builds.
- **No popularity claims.** Nothing we ingest measures usage. Answers say "published by X".
- **Credits** for Blueberries.gg (Ric Molina), AegisRelic, Destiny Data Compendium,
  Destinypedia (CC BY-SA 4.0), Bungie, Steam announcements. Facts are extracted; article prose
  is not copied.
- **Do not scrape** light.gg (403, no API) or builders.gg (robots disallows AI crawlers).
  Handoff links instead.

## Interface

Chat with local-only history, streamed answers with a shimmer skeleton, collapsible
references, rename, hold-to-dismantle, invite modal, mobile drawer, credits dialog, dark
Destiny-style theme. The model never sees a database: the server queries and pastes rows.

## Answer evals

`evals/answers.json` holds 20 graded cases: question, expected facts, forbidden strings and
optional expected refusal. They cover the traps that actually reached the user — exotic weapon
vs armour, heavy vs special ammo, class-item perks, archive vs free, retired stat names,
follow-up questions, live-state questions.

- `pnpm eval:answers` runs the suite. Above five cases it refuses without `--yes` and prints
  a token and cost estimate; `--only <id>` runs one case.
- One full run re-sends about **114k prompt tokens** (20 cases × ~5.7k). A baseline, a fix pass
  and a final run cost roughly **$1** on `gpt-5.4-mini`, which is 25× over the estimate. Iterate
  with `--only`, run the full suite only to grade.
- Baselines are generated, not committed; `evals/*-baseline.json` is ignored.
- First baseline: 14/20, before the prompt and resolver fixes in `c07bc8c`.

## Known gaps

1. **Stat priorities for pre-rework builds** are unavailable; answers say so rather than guess.
   Fixing this needs a current build source or curated entries.
2. **Scenario tags** (lowman, speedrun, challenge) do not exist; sources do not label builds
   that way.
3. **No live state**: weekly rotation, Xur, vendors, current artifact need the Bungie API.
4. **No answer-level evals.** Retrieval is scored (hit@8); prose is not. Category and stat
   regressions were caught by the user, not by tests.
5. **Post-checks missing**: the model can still volunteer a stat order or pipeline language;
   there is a client scrub for the latter only.
6. **546 weapons have `unknown` access**, mostly legacy source strings Bungie never updated.

## Next steps, in order

1. Deterministic post-check that drops a stat order when no source carries a current line.
2. Bungie API tools: rotation, Xur, vendors — the largest remaining product gap.
3. Curated or sourced scenario builds; contributions from people who play those modes.
4. Mastra is only worth adopting for eval/observability or an agent loop with live tools —
   never for ingestion, which carries hard-won domain knowledge.
