# Spike: Destiny 2 data Q&A

Throwaway proof of concept. Goal: see whether answers grounded in the Bungie
manifest plus AegisRelic's numbers are good enough to build on. No web UI, no
auth, no hosting, nothing here is production code.

## What it does

`sync.mjs` downloads the Bungie manifest (the SQLite world-content file), pulls
the AegisRelic Endgame Analysis tabs, and writes everything into `game.db`.

`ask.mjs` sends your question to an OpenAI-compatible model, lets it run
read-only SQL against `game.db`, prints every query it ran, and answers using
only the rows it got back.

## Run it

Needs Node 22 or newer. No dependencies to install.

```bash
node sync.mjs          # ~40MB download, builds game.db
node ask.mjs           # prints the database and example queries
node ask.mjs "what is the best DPS heavy weapon right now"
```

## Model setup

Copy `.env.example` to `.env` and fill it in.

```bash
LLM_API_KEY=...
LLM_MODEL=gpt-5.4-mini
LLM_BASE_URL=https://opencode.ai/inference/openai/v1
```

Find a model id with:

```bash
node ask.mjs --models
```

Any OpenAI-compatible endpoint works. Change `LLM_BASE_URL` and `LLM_MODEL` to
switch providers; nothing else in the code is provider-specific.

## What is inside the database

- `weapons` — 1393 rows, one per weapon, deduped by name (reissues keep the row
  with the most roll options). Stats, damage type, ammo type, possible perks.
- `aegis_archetypes` — 94 rows, one per weapon frame family. Base damage,
  damage scalars, crit multiplier, RPM, intervals, MDPS/BDPS columns, tier.
- `aegis_weapons` — 748 rows, per-weapon recommendations: tier, source,
  recommended perks, analysis notes.
- `meta` — manifest version and sync time.

## Known limits

- No live data: vendors, Xur, weekly rotation and milestones are not here. That
  needs a Bungie API key and a separate call path.
- Reissue dedupe keeps the widest perk list, which can differ slightly from the
  version you own.
- AegisRelic columns are mapped by header name; a renamed column breaks the sync
  silently. There is no check for that yet.
- Numbers are stored as text, so queries need `cast(x as real)`.

## Test questions

Use these to judge whether it is worth building:

1. What is the best DPS Power weapon right now?
2. What LFR should I use for a boss with a long damage phase?
3. Refurbished A499 stats and perks — is it worth running?
4. Which rockets are S tier and where do they drop?
5. Best DPS for a short damage window vs a long one?
6. What is the tier of Edge Transit and what perks should I look for?
7. Which hand cannons are top tier and what do they roll?
8. What is the max DPS of a Rapid-fire LMG?
9. I am new — which of these weapons can I actually get easily?
10. What is the crit multiplier on Precision LFRs?

Mark each answer: correct, partly right, wrong, or "said it did not know".
That score is the real output of this spike.
