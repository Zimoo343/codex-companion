# Codex Companion — implementation plan

Design: `docs/superpowers/specs/2026-11-04-codex-companion-design.md`
Date: 2026-11-04

Each phase ends in something visible. Do not start the next phase before the
acceptance check passes.

## Phase 0 — repository foundation

- `git init`, `.gitignore` (node, env, db artifacts, `.next`, `*.content`).
- MIT `LICENSE`.
- `README.md`: what it is, screenshot slot, data credits (Bungie, AegisRelic, DDC),
  link to the design doc, how to run.
- `pnpm` workspace, Node 24, `prettier` and `oxlint`.
- Move `spike/` to `spikes/manifest-probe/` with a README saying it is the validation
  spike, not production code, and is excluded from lint and typecheck.
- Rotate the API key pasted in chat. Put the new one only in `.env.local`.

Acceptance: `git log` has an initial commit, README renders, `pnpm lint` clean on
the new files, spike still runs from its new home.

## Phase 1 — data layer

- Drizzle schema and migrations for: `sources`, `sync_runs`, `weapons`, `armor`,
  `subclass_plugs`, `activities`, `aegis_weapons`, `aegis_archetypes`,
  `external_tools`, `corrections`. `guides` arrives in Phase 4 and can be added then.
- Port the spike importers to TypeScript under `src/server/sync/`: manifest download
  and unzip, item/armor/plug/activity builders, sheet fetcher, CSV parser.
- Keep the same rules that took a debug cycle to find: fragment descriptions live on
  the sandbox perk, activities collapse by name with a `variants` count, weapons
  dedupe by richest perk list, `meta` has `key`/`value`.
- Unit tests colocated for CSV parser, column slugging, activity name normalisation,
  and weapon dedupe.
- `pnpm sync` runs against `DATABASE_URL`, records a `sync_runs` row, and skips the
  rebuild when the manifest version is unchanged.
- Seed `external_tools` from a checked-in JSON file.

Acceptance: syncing an empty dev database reproduces the spike counts (1393 weapons,
141 armor, 331 plugs, 214 activities, 748/94 sheet rows), a second run skips, and
`pnpm test` passes.

## Phase 2 — RAG in the terminal

- Guide ingestion: official announcements from the Steam news API, filtered to
  `steam_community_announcements`; Destinypedia pages via the MediaWiki API under
  CC-BY-SA with attribution stored per chunk.
- Heading-aware chunking, embedding with `text-embedding-3-small`, upsert by URL and
  section hash so unchanged text is never re-embedded.
- A CLI `rag` command, like the spike: ask a question, see the retrieved chunks with
  scores, and the answer with citations. This is the learning surface.
- Tuning notes kept in `docs/rag-notes.md`: chunk size, overlap, top-k, distance metric,
  what got missed and why.

Acceptance: a patch-notes question cites the right announcement with its date, and a
re-run of ingestion embeds zero unchanged chunks.

## Phase 3 — agent and evals

- `eve init` in the repo root; agent instructions from the spike prompt, rewritten
  for the app.
- Tools: `query_game_data` (read-only, single statement, row cap), `search_guides`
  (source, date and licence metadata returned), `get_data_version`, `find_tool`.
- Register rules: plain-language default, technical on request, assumptions stated
  for ambiguous damage questions.
- Handoff rules from the design doc, and refusal rules for builds and DLC.
- Evals: the ten spike questions plus damage-math, armor, subclass, activity,
  handoff and refusal cases, about 30 total.

Acceptance: `eve eval` runs green on the graded set, and every failure is either
fixed or written down in the plan's open issues.

## Phase 4 — API and UI

- Next.js chat page with streaming answers and citation chips that link to the
  source rows.
- Data-date footer on every answer.
- Invite-code gate from an env var, one code, no accounts.
- Per-IP rate limit and a daily spend cap stored in Postgres, plus a matching cap in
  the provider console.
- Feedback button writing to `corrections`.

Acceptance: local dev answers a question end to end with citations; a scripted loop
of requests trips the cap and stops answering.

## Phase 5 — CI and deployment

- GitHub Actions: typecheck, lint, unit tests on every push; nightly sync that exits
  early when the manifest version is unchanged; eval job on prompt or tool changes.
- Neon production branch, Vercel deployment, env vars set in the dashboard.
- README updated with the live URL, a screenshot and the tool-handoff list.

Acceptance: a push to main deploys, the invite-gated URL answers correctly, and a
failing eval blocks the deploy.

## Milestones

1. M1 — data sync in Postgres, tested (Phase 0–1)
2. M2 — RAG loop working in the terminal, with tuning notes (Phase 2)
3. M3 — agent with both tools, evals green (Phase 3)
4. M4 — invite-only web demo (Phase 4)
5. M5 — CI and production deploy (Phase 5)

## Open issues to settle while building

- Chunk size and overlap for patch notes versus wiki pages.
- Whether the daily cap counts requests or tokens.
- Whether the invite code is a single shared code or per-person codes.
- Which Destinypedia pages to ingest first; start with abilities, damage types,
  champions and mods.
- Whether `spikes/manifest-probe/` stays in the repo long term or is deleted once
  Phase 1 passes.

## Risks

- eve is a release candidate. Mitigation: all data access behind own modules, tools
  are thin wrappers.
- Patch notes are long and repetitive, which can flood retrieval. Mitigation:
  heading-aware chunks, recency boost, eval cases for older updates.
- A single maintainer plus nightly data jobs is how projects rot. Mitigation: CI
  fails loudly, sync is idempotent, and every failure names the column or file.
- Cost drift on a public demo. Mitigation: two independent caps.
