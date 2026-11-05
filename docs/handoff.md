# Handoff — where the project stands

Last updated: 2026-11-04. Read this first in a new session, then the design and plan
under `docs/superpowers/`.

## What this is

Codex Companion: a Destiny 2 knowledge companion. Plain-language answers for new and
returning players, exact numbers on request, every answer citing the rows or
documents it used.

Repository: local folder `D:\VsCode\ai-rag`, repo name on GitHub will be
`codex-companion`. Folder name is cosmetic; git does not care.

## Status

Phase 1 done. Data lives in Neon Postgres and syncs with `pnpm sync`.

Phase 0 done and committed (`2d1a387`, plus `d9629dc`). Nothing else built yet.

- Design: `docs/superpowers/specs/2026-11-04-codex-companion-design.md` — approved.
- Plan: `docs/superpowers/plans/2026-11-04-codex-companion-plan.md` — approved, RAG
  reordered to Phase 2 at the author's request, because learning retrieval is the
  point of the project.
- Spike: `spikes/manifest-probe/` — throwaway validation code, works, kept as
  evidence. Has its own README and TESTING cheat sheet.

## Decisions, and why

- **Hybrid data model, not doc RAG.** Plain chunk-and-embed answers numbers
  confidently and wrongly. Structured tables for facts, vector search for prose.
- **eve as the agent framework**, with all data access behind own modules so tools
  stay thin wrappers and the framework stays replaceable. eve is a release candidate;
  that is the accepted risk.
- **Data access in its own layer.** The spike's import logic ports to TypeScript in
  Phase 1; tools never talk to the database directly.
- **Plain answers by default, technical on request.** The author judged the spike's
  number-dump answers unreadable for a new player.
- **Handoffs instead of coverage.** DIM, d2armorpicker, destiny.report, light.gg,
  braytech, raid.report, dungeon.report, trials.report, destinytracker, raidhub.
  One sentence plus a link, never a list, never an ad.
- **MIT licence for code**, community data stays with its authors, credited and
  linked, never redistributed.
- **Invite-only launch** on Vercel while the eval set is thin.
- **Path of Exile 2 out of scope**, codename deliberately game-neutral.
- **v1 includes vector search**: official announcements via the Steam news API, plus
  Destinypedia under CC-BY-SA.
- **Model access** through OpenCode Console service-account key, OpenAI-compatible
  endpoint, `LLM_MODEL` plus `LLM_FALLBACK_MODEL`. No embedding model there.
- **Embeddings: OpenAI `text-embedding-3-small`, chosen deliberately.** Local
  embeddings through `transformers.js` were considered — free, no account, good for
  learning — and rejected for this project because the target is a Vercel-hosted app
  where a 130MB model per cold start is the wrong shape. Cost is a few cents for the
  whole corpus plus roughly nothing per query. The provider still sits behind our own
  module, so a local provider can be added later without touching callers.

## Spike findings that must survive the port

These each cost a debug cycle. Do not rediscover them.

- Bungie's world content file is a **zip**, not raw SQLite. Unzip single entry, then
  open with `node:sqlite`.
- Item `ammoType` lives under `equippingBlock`, not `equipment`.
- Damage type is an enum; map through `DestinyDamageTypeDefinition` to get names.
- Weapons repeat under one name (reissues). Keep the row with the most plugs.
- **Fragment and aspect descriptions live on the sandbox perk**, not on the item.
  Without resolving `DestinySandboxPerkDefinition`, only 2 of 331 rows import.
- Activities repeat per difficulty. Collapse by name, keep a `variants` count;
  1708 rows become 214.
- Sheet CSVs contain commas and newlines inside quoted cells. Use a real parser.
- The sheet header row drives the column mapping; a renamed column fails silently
  unless the import checks it.
- `meta` has columns `key` and `value`. Aliasing that table causes a bad query.
- Tier letters are S,A,B,C,D,E,F. Never cast them to numbers.
- "Best DPS" is ambiguous: burst (`1mag_bdps`) versus sustained (`typical_bdps`,
  `max_bdps`). Answers must state the assumption.
- Sword rows repeat the same value across all three DPS columns, because they assume
  constant heavy ammo and melee range. Say so.
- `light.gg` returns 403 to bots and has no public API. Link out, never scrape.
- Bungie's own news feed gives titles only; the article page returns a shell. Steam's
  public news API gives full Bungie announcements, filter to
  `steam_community_announcements`.
- OpenCode's `/models` lives at `/inference/v1/models`, chat at
  `/inference/openai/v1/chat/completions`.
- Gemini 3.5 Flash Lite returns 502 upstream in bursts; that is why the fallback
  model exists.

## Spike numbers to reproduce in Phase 1

141 exotic armor, 331 subclass plugs, 214 activities, 748 per-weapon recommendation
rows, 94 archetype rows, 10 external tools. Manifest version seen:
`245114.26.10.13.2000-1-bnet.66137`.

Weapons land at **1318**, not the spike's 1393. Difference is intentional: the spike
kept every reissue that tied on plug count, Phase 1 keeps exactly one row per name,
picking the widest plug list. Deterministic beats faithful to a tie.

## Prerequisites for Phase 1

1. **Rotate the API key pasted into chat** and put the new one only in `.env.local`.
2. **Neon project** created; `DATABASE_URL` in `.env.local`, never in chat or git.
3. Decide **public or private** for the GitHub repo; `gh` is authenticated as
   `Zimoo343`, so pushing is one command.

## What exists now

- `pnpm sync` — manifest, sheets and reference data into Postgres, with a version gate
- `pnpm sync manifest|sheets|reference` — run one part
- `pnpm test` — 17 unit tests, Node's own runner, no build step
- `pnpm typecheck`, `pnpm lint`, `pnpm fmt`
- `drizzle/` — migrations, pgvector already enabled

## Next step

Phase 2 — RAG in the terminal: ingest official announcements (Steam news API,
`steam_community_announcements` only) and Destinypedia (`CC-BY-SA`, attribution per
chunk); heading-aware chunking; embeddings with OpenAI `text-embedding-3-small`;
pgvector storage and cosine retrieval; a CLI that shows retrieved chunks with scores
plus the answer, and `docs/rag-notes.md` recording chunk size, overlap and top-k
experiments.

Prerequisite: an OpenAI API key in `.env.local` as `OPENAI_API_KEY`.

Create it at `platform.openai.com` → Billing (add $5) → API keys → name it
`codex-companion`, then set a project monthly limit of $5. Corpus embedding costs
roughly 2–4 cents once; re-embedding only happens for changed text.

Note: embeddings from different models are not interchangeable. If the provider ever
changes, the whole corpus must be re-embedded and the vector column rebuilt.
