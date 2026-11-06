import { buildStructuredContext } from "./context.ts";
import { embedQuestion, searchEntities, searchGuidesByVector, type GuideHit } from "./search.ts";
import { createDatabase } from "../db/client.ts";

const baseUrl = (process.env.LLM_BASE_URL ?? "https://opencode.ai/inference/openai/v1").replace(
  /\/$/,
  "",
);
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const fallbackModel = process.env.LLM_FALLBACK_MODEL;

const SYSTEM_PROMPT = `You are a Destiny 2 expert answering questions for new and returning players.

Voice rules:
- Answer as the product itself, never as an assistant describing its inputs.
- Never say "the data you provided", "the sources you gave", "the database", "the chunks" or "your evidence". A player does not know any of that exists.
- Do not offer "if you want, I can also..." more than once per answer.

You get two kinds of evidence:
- GAME DATA: rows from Bungie's manifest and the community sheets (AegisRelic, Destiny Data Compendium). Exact stats, tiers, perks, mechanics and damage numbers.
- WIKI SOURCES: numbered excerpts. Cite these as [1], [2].

Rules:
- GAME DATA is authoritative. When it contains a tier or a number, use it. Never say you lack numbers while GAME DATA has them.
- Wiki sources add context, history and mechanics. They are not a tier list; never let a wiki page overrule a GAME DATA tier.
- If GAME DATA lists an S tier weapon for the family asked about, name it as the recommendation.
- Plain language first: which weapon, why, where it drops. Numbers second.
- Damage questions are ambiguous. If the question does not say burst or sustained, say which you are using and cover both. Burst uses one_mag_bdps, sustained uses typical_bdps and max_bdps.
- max_bdps assumes perfect swaps and ability combos; typical_bdps is the realistic number. Say which you quote.
- Tier letters are S, A, B, C, D, E, F. A tier is a recommendation grade, not a damage number, so never answer a damage question with tiers alone.
- Sword rows repeat the same value across damage columns because they assume constant heavy ammo and melee range. If swords appear at the top of a damage ranking, state that caveat in the same sentence as the number.
- The damage tables carry a rank column: rank 1 is best for that metric. Quote the rank 1 row for each metric. Never call two different values a tie.
- Check analysis_notes before crowning a winner; a row can win on paper and be impractical.
- If two answers are close or the winner depends on the fight, say it depends and give both conditions.
- Never invent a number. If neither data nor sources answer, say so.
- Never list weapons, armor or perks that do not appear in GAME DATA or the wiki sources, even as "usual picks". If the evidence is missing, say it is missing and stop.
- If a source is about the original Destiny, say that instead of presenting it as Destiny 2.
- When asked what pairs with a weapon, only suggest something from a different slot. A Heavy weapon cannot pair with another Heavy weapon. If the rotation rows name a specific pairing, quote that pairing instead of inventing one.
- Answer the category that was asked. A question about exotic weapons must not be answered with exotic armour or subclass perks; if no weapon fits the evidence, say so.
- The class item combination list is unordered unless a rating is given. Never crown one as "best"; present the pairings that fit the request and say the list is not ranked.
- Mention the update or date when a source is a patch note or announcement.
- Only cite sources that actually support a claim you make. If a source was retrieved but is irrelevant, ignore it.`;

export type AnswerSource = {
  index: number;
  title: string;
  section: string;
  url: string;
  sourceName: string;
  score: number;
};

const SHEET_URLS: Record<string, string> = {
  AegisRelic: "https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY",
  "AegisRelic Boss Damage":
    "https://docs.google.com/spreadsheets/d/1_5wtBjRYHHxuF4oJKDb_iOGZs-wTkzB6RYbnyNLbuz4",
  "Destiny Data Compendium":
    "https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4",
};

function entitySource(kind: string, meta: Record<string, string>): string {
  if (kind === "recommendation" || kind === "damage_frame") return "AegisRelic";
  if (kind === "class_item_combo" || kind === "build") return "AegisRelic class items";
  if (kind === "sheet_row") return meta.source ?? "Community sheet";
  return "Bungie manifest";
}

function toolUrl(kind: string, meta: Record<string, string>): string {
  if (kind === "class_item_combo" || kind === "build") {
    return "https://docs.google.com/spreadsheets/d/1-pvCrjb9QLEwvQn0YquCxvZzMh25gMIh4ZrNe1DdAsY";
  }
  if (kind === "recommendation" || kind === "damage_frame") return SHEET_URLS.AegisRelic!;
  if (kind === "sheet_row") return SHEET_URLS[meta.source ?? ""] ?? SHEET_URLS.AegisRelic!;
  return "https://www.bungie.net/7/en/Destiny/NewLight";
}

export type Answer = {
  answer: string;
  sources: AnswerSource[];
  dataVersion: string;
};

function formatSources(hits: GuideHit[]): string {
  return hits
    .map((hit, index) => {
      const date = hit.publishedAt ? ` (${hit.publishedAt.toISOString().slice(0, 10)})` : "";
      const section = hit.section ? ` — ${hit.section}` : "";
      return `[${index + 1}] ${hit.title}${date}${section}\n${hit.content}\nSource: ${hit.sourceName} ${hit.url}`;
    })
    .join("\n\n");
}

async function chat(messages: Array<{ role: string; content: string }>): Promise<string> {
  for (const candidate of [model, fallbackModel].filter(Boolean)) {
    for (let tries = 1; tries <= 3; tries++) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: candidate, messages, temperature: 0.2 }),
      });

      if (response.ok) {
        const body = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        return body.choices[0]?.message.content ?? "";
      }

      if (response.status < 500 || tries === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 1200 * tries));
    }
  }
  throw new Error("no model answered");
}

async function currentDataVersion(): Promise<string> {
  const { pool } = createDatabase();
  try {
    const result = await pool.query<{ version: string }>(
      `select version from sync_runs where kind = 'manifest' and status = 'ok'
        order by started_at desc limit 1`,
    );
    return result.rows[0]?.version ?? "unknown";
  } finally {
    await pool.end();
  }
}

export type PreparedAnswer = {
  sources: AnswerSource[];
  dataVersion: string;
  messages: Array<{ role: string; content: string }>;
};

export async function prepareAnswer(
  question: string,
  limit = 5,
  history = "",
): Promise<PreparedAnswer> {
  const vector = await embedQuestion(question);

  const [allHits, entities, structured] = await Promise.all([
    searchGuidesByVector(vector, question, limit),
    searchEntities(vector, 6),
    buildStructuredContext(question, history),
  ]);

  // Cosine scores are compressed, so an absolute cutoff cannot separate relevant from
  // accidental. Require a genuinely strong match, or an exact keyword hit, and drop
  // the whole wiki block when nothing clears the bar.
  const minSimilarity = Number(process.env.MIN_GUIDE_SIMILARITY ?? 0.55);
  const bestGuide = allHits.reduce((best, hit) => Math.max(best, hit.vectorScore), 0);
  const keepGuides = bestGuide >= minSimilarity;
  const hits = keepGuides
    ? allHits.filter(
        (hit) =>
          hit.vectorScore >= Math.max(minSimilarity, bestGuide - 0.05) ||
          (hit.keywordRank ?? 99) <= 3,
      )
    : [];

  // Same idea for entity matches: keep the head of the distribution only, and drop
  // kinds the question is not about (a rocket question does not want subclass plugs).
  const wantsSubclass = /aspect|fragment|subclass|artifact|melee|grenade|super/i.test(question);
  const wantsActivity = /raid|dungeon|strike|nightfall|lost sector|activity/i.test(question);
  // Sheet-derived entities carry their tab; keep them in the asked category too.
  const ARMOR_TABS = [
    "Armor Perks",
    "Armor Mods",
    "Exotic Armors",
    "Exotic Class",
    "Class Abilities",
  ];
  const WEAPON_TABS = ["Weapon Perks", "Exotic Weapons"];
  // Use the conversation too: "pair it with..." only names a category in the history.
  const filterText = `${history}
${question}`;
  const asksWeapon =
    /\b(weapon|rocket|sniper|shotgun|fusion|linear|machine gun|lmg|auto rifle|hand cannon|pulse|scout|sidearm|smg|glaive|sword|bow|trace|launcher)\b/i.test(
      filterText,
    );
  const asksArmor = /\b(armor|helmet|gauntlet|chest|legs|class item)\b/i.test(filterText);

  const relevant = entities.filter((entity) => {
    if (entity.kind === "sheet_row") {
      const tab = entity.meta.tab ?? "";
      if (asksWeapon && !asksArmor && ARMOR_TABS.includes(tab)) return false;
      if (asksArmor && !asksWeapon && WEAPON_TABS.includes(tab)) return false;
    }
    if (entity.kind === "subclass_plug" && !wantsSubclass) return false;
    if (entity.kind === "activity" && !wantsActivity) return false;
    return true;
  });

  const bestEntity = relevant.reduce((best, entity) => Math.max(best, entity.score), 0);
  const keptEntities =
    bestEntity >= 0.5
      ? relevant.filter((entity) => entity.score >= bestEntity - 0.04).slice(0, 5)
      : [];

  const entityText = keptEntities
    .map((entity) => `[${entity.kind}] ${entity.name}: ${entity.text}`)
    .join("\n");

  const parts = [
    structured.text ? `GAME DATA\n\n${structured.text}` : "",
    entityText
      ? `ENTITY DATA (semantic matches across weapons, armor, activities, perks and sheet rows)\n\n${entityText}`
      : "",
    `WIKI SOURCES\n\n${formatSources(hits)}`,
    history
      ? `Recent conversation (context only, do not repeat it):
${history}`
      : "",
    `Question: ${question}`,
  ].filter(Boolean);

  return {
    dataVersion: await currentDataVersion(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: parts.join("\n\n") },
    ],
    sources: [
      ...hits.map((hit, index) => ({
        index: index + 1,
        title: hit.title,
        section: hit.section,
        url: hit.url,
        sourceName: hit.sourceName,
        score: hit.score,
      })),
      ...keptEntities.map((entity, index) => ({
        index: hits.length + index + 1,
        title: entity.name,
        section: entity.kind.replace(/_/g, " "),
        url: toolUrl(entity.kind, entity.meta),
        sourceName: entitySource(entity.kind, entity.meta),
        score: entity.score,
      })),
      ...structured.origins.map((origin, index) => ({
        index: hits.length + keptEntities.length + index + 1,
        title: origin.title,
        section: "data table",
        url: origin.url,
        sourceName: origin.sourceName,
        score: 0,
      })),
    ],
  };
}

export async function answerQuestion(question: string, limit = 5, history = ""): Promise<Answer> {
  const prepared = await prepareAnswer(question, limit, history);
  const answer = await chat(prepared.messages);
  return { answer, sources: prepared.sources, dataVersion: prepared.dataVersion };
}
