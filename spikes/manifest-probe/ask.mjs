// Throwaway spike: ask questions about Destiny 2 data from the command line.
// Run: node spike/ask.mjs "what is the best DPS rocket right now"
// Needs an OpenAI-compatible endpoint in env:
//   LLM_API_KEY=...  LLM_BASE_URL=https://opencode.ai/inference/openai/v1  LLM_MODEL=<model id>
// Env is read from spike/.env if present.
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";

const DB_PATH = process.env.SPIKE_DB ?? new URL("./game.db", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ENV_PATH = new URL("./.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const SCHEMA = `
table weapons (Bungie manifest, one row per weapon, deduped by name)
  hash text, name text, type text ("Adaptive Grenade Launcher"),
  tier text (Exotic/Legendary/Rare), damage_type text (Kinetic/Arc/Solar/Void/Stasis/Strand),
  frame text, ammo_type text (Primary/Special/Heavy),
  stats json ({"Range": 40, "Impact": 60, ...}),
  perks json (["Arrowhead Brake", ...] every plug this weapon can roll)

table aegis_archetypes (AegisRelic Endgame Analysis, one row per weapon frame family)
  weapon, frame, stun, ammo (Primary/Special/Power), base_damage, minor_scalar,
  elite_scalar, crit_multi, max_ammo, base_interval, optimized_interval, true_rpm,
  tested_mag, base_reload, base_dump, max_brick, "1mag_mdps", max_mdps, luna_mdps,
  typical_mdps, body_mdps, typical_edps, max_bdps, luna_bdps, typical_bdps,
  boss_total, minor_total, ads_falloff_range, analysis_notes, tier (S/A/B/C/D/E/F)
  Numeric columns are text, so cast: cast(max_mdps as real)

table aegis_weapons (community per-weapon recommendations)
  tab (weapon family: HGLs, LFRs, Rockets, Autos, HCs, ...), name, season, energy,
  frame, source (where it drops), ammo, barrel, magazine, masterwork, perk1, perk2,
  origin_trait, notes (analysis), tier

table armor (exotic armor only, one row per piece)
  name, slot (Helmet/Gauntlets/Chest Armor/Leg Armor/Class Item), class (Titan/Hunter/Warlock),
  stats json, perks json (exotic perk descriptions), description

table subclass_plugs (aspects, fragments and artifact perks)
  name, kind (aspect/fragment/artifact perk), class (hunter/titan/warlock/shared),
  element (arc/solar/void/stasis/strand/prism, empty for artifact perks), description
  Artifact perks carry no season, so they are all historical. Say so if the season matters.

table activities (raids, dungeons, strikes, nightfalls, lost sectors, exotic missions)
  name, type, place, destination, light_level, is_pvp (always 0), variants
  variants is how many difficulty or legacy versions the manifest holds for that name.
  Vaulted content is still listed. Do not claim something is currently available.

table meta (key, value) - manifest_version, synced_at
`;

const SYSTEM_PROMPT = `You are a Destiny 2 expert answering questions for returning and new players.

Who you are talking to:
- Default reader is a new or returning player who does not know community jargon.
- Lead with the recommendation in plain words: which weapon, why, and where it drops.
- Do not dump numbers unless they answer the question. "Best DPS" should not open with 1,745 BDPS.
- If you do use a number, explain it in a few words the first time: "BDPS (boss damage per second, one full magazine)", "total (whole ammo reserve)".
- If the user asks for numbers, comparisons, or how something is calculated, switch to technical detail: exact figures, column names, and what the assumptions are.

Rules:
- Numbers and recommendations must come from the database. Call run_sql before answering anything factual.
- Use weapons.* for stats, archetype, damage type and possible perks. Use aegis_weapons.* for tier, recommended perks, source and analysis notes.
- Name the exact rows you used. If the data does not contain the answer, say so plainly. Never guess numbers.
- Start the answer with one direct sentence. Then details. Keep it short.
- State the manifest version as the data date.
- Tier order is S, A, B, C, D, E, F. Never cast tier to a number. Use: order by case tier when 'S' then 0 when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 when 'E' then 5 else 6 end
- aegis_weapons.tier is a grade for that weapon family, not a DPS number. Never answer a damage question with tiers alone.

Damage questions:
- "Best DPS" is ambiguous. If the question does not say burst or sustained, say which assumption you are using and split the answer: burst uses 1mag_bdps, sustained uses typical_bdps and max_bdps.
- Damage numbers by frame live in aegis_archetypes (columns 1mag_bdps, max_bdps, typical_bdps, max_mdps, typical_mdps, boss_total). Those are per frame and perk roll, not per weapon. Say so.
- Combine the two: frame numbers from aegis_archetypes, recommended perks and source from aegis_weapons, base stats from weapons.
- max_bdps assumes perfect swaps and ability combos. typical_bdps is the realistic no-swap number. Say which one you are quoting.
- weapon values ending in "- drum" are drum grenade launchers; "Pack Hunter" and "Jagged Edge" in frame means the number assumes that perk or origin.
- Check analysis_notes before crowning a winner. A row can win on paper and be impractical (range, ammo economy, needing a second Exotic).
- Sword rows repeat the same value in 1mag_bdps, max_bdps and typical_bdps because they assume constant heavy ammo and being in melee range. Say that whenever swords top a damage chart.
- If two answers are close or the winner depends on the fight, say it depends and give both, with the condition for each.

Table notes:
- meta has exactly two columns, key and value. Read the version with: select value from meta where key='manifest_version'. Do not alias that table.

Not in the database. Say you do not have it instead of querying for it:
builds (perk and mod loadouts), live vendor stock, Xur, weekly or daily rotation,
DLC prices, what is free to play, patch notes, quest steps, maps and routes,
current season artifact selection.

Useful patterns:
- Burst by frame: select weapon, frame, ammo, "1mag_bdps", boss_total from aegis_archetypes where ammo='Power' order by cast("1mag_bdps" as real) desc limit 6
- Sustained by frame: select weapon, frame, ammo, max_bdps, typical_bdps from aegis_archetypes where ammo='Power' order by cast(typical_bdps as real) desc limit 6
- Top weapons in a family: select name, tier, frame, perk1, perk2, notes from aegis_weapons where tab='HGLs' order by case tier when 'S' then 0 when 'A' then 1 when 'B' then 2 else 3 end limit 5
- Weapon lookup: select name, type, damage_type, stats, perks from weapons where name like '%Refurbished%'
- json_extract is available: json_extract(stats, '$."Range"')`;

function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile();

const baseUrl = (process.env.LLM_BASE_URL ?? "https://opencode.ai/inference/openai/v1").replace(/\/$/, "");
const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
const model = process.env.LLM_MODEL;
const fallbackModel = process.env.LLM_FALLBACK_MODEL;

function openDatabase() {
  if (!existsSync(DB_PATH)) {
    console.error("game.db missing. Run: node spike/sync.mjs");
    process.exit(1);
  }
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

function runSql(db, query) {
  const trimmed = query.trim().replace(/;$/, "");
  if (!/^(select|with)\b/i.test(trimmed)) return { error: "Only SELECT queries are allowed." };
  if (/;\s*\S/.test(trimmed)) return { error: "One statement only." };
  try {
    const rows = db.prepare(`select * from (${trimmed}) limit 100`).all();
    return { rowCount: rows.length, rows };
  } catch (error) {
    return { error: String(error.message) };
  }
}

async function chat(messages, tools) {
  const models = [model, fallbackModel].filter(Boolean);
  const modelsTried = [...new Set(models)];
  let lastError;

  for (const currentModel of modelsTried) {
    const result = await requestModel(currentModel, messages, tools);
    if (result.response) return result.response;
    lastError = result.error;
    if (currentModel !== modelsTried.at(-1)) process.stderr.write(`model ${currentModel} unavailable, trying ${modelsTried.at(-1)}\n`);
  }

  throw lastError;
}

async function requestModel(currentModel, messages, tools) {
  const body = JSON.stringify({ model: currentModel, messages, tools, temperature: 0.2 });

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body,
      });
    } catch (error) {
      if (attempt === 3) return { error };
      process.stderr.write(`network error, retrying (${attempt}/3)\n`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      continue;
    }

    if (response.ok) return { response: await response.json() };

    const text = await response.text();
    const error = new Error(`${currentModel}: ${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
    if (response.status < 500 || attempt === 3) return { error };

    process.stderr.write(`upstream ${response.status}, retrying (${attempt}/3)\n`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
  }

  return { error: new Error(`${currentModel}: request failed`) };
}

const tools = [{
  type: "function",
  function: {
    name: "run_sql",
    description: "Read-only SQL against the Destiny 2 database. Returns up to 100 rows.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "A single SELECT or WITH statement." } },
      required: ["query"],
    },
  },
}];

async function listModels() {
  const modelsUrl = process.env.LLM_MODELS_URL ?? `${baseUrl.replace(/\/openai\/v1$/, "/v1")}/models`;
  const res = await fetch(modelsUrl, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  for (const model of body.data ?? []) console.log(model.id);
}

async function main() {
  if (process.argv.includes("--models")) {
    if (!apiKey) {
      console.error("Set LLM_API_KEY first (spike/.env).");
      process.exit(1);
    }
    return listModels();
  }

  const db = openDatabase();
  const question = process.argv.slice(2).join(" ").trim();

  const meta = Object.fromEntries(db.prepare("select key, value from meta").all().map((row) => [row.key, row.value]));

  if (!apiKey || !model) {
    console.error("No model configured. Create spike/.env with LLM_API_KEY, LLM_MODEL (and LLM_BASE_URL if not OpenCode).");
    process.exit(1);
  }

  const messages = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nDatabase schema:\n${SCHEMA}\nData version: manifest ${meta.manifest_version}, synced ${meta.synced_at}.` },
  ];

  if (!question) return repl(db, messages);

  console.log(`data: manifest ${meta.manifest_version} synced ${meta.synced_at}`);
  await askQuestion(db, messages, question);
}

async function askQuestion(db, messages, question) {
  messages.push({ role: "user", content: question });

  for (let step = 0; step < 6; step++) {
    const response = await chat(messages, tools);
    const message = response.choices[0].message;
    messages.push(message);

    if (!message.tool_calls?.length) {
      console.log(`\n${message.content}\n`);
      return;
    }

    for (const call of message.tool_calls) {
      const query = JSON.parse(call.function.arguments).query;
      const result = runSql(db, query);
      console.log(`\n-- sql\n${query}`);
      console.log(`-- result ${result.error ?? `${result.rowCount} rows`}`);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
    }
  }
  console.error("stopped after 6 tool rounds");
}

async function repl(db, messages) {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`Destiny 2 data. manifest ${db.prepare("select value from meta where key='manifest_version'").get().value}`);
  console.log("Ask a question. 'tech' toggles exact numbers, 'new' clears the conversation, 'sql <query>' runs raw SQL, 'exit' quits.\n");

  let technical = false;

  while (true) {
    const input = (await rl.question(technical ? "d2 [numbers]> " : "d2> ")).trim();
    if (!input) continue;
    if (input === "exit" || input === "quit") break;
    if (input === "tech") {
      technical = !technical;
      console.log(`exact numbers ${technical ? "on" : "off"}\n`);
      continue;
    }
    if (input === "new" || input === "reset") {
      messages.length = 1;
      console.log("conversation cleared\n");
      continue;
    }
    if (input.startsWith("sql ")) {
      const result = runSql(db, input.slice(4));
      console.log(JSON.stringify(result, null, 2), "\n");
      continue;
    }

    try {
      const prefixed = technical
        ? `Answer with exact numbers, column names and the assumptions behind them.\n\n${input}`
        : input;
      await askQuestion(db, messages, prefixed);
    } catch (error) {
      console.error(String(error.message ?? error), "\n");
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
