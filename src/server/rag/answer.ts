import { buildStructuredContext } from "./context.ts";
import { searchGuides, type GuideHit } from "./search.ts";
import { createDatabase } from "../db/client.ts";

const baseUrl = (process.env.LLM_BASE_URL ?? "https://opencode.ai/inference/openai/v1").replace(
  /\/$/,
  "",
);
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const fallbackModel = process.env.LLM_FALLBACK_MODEL;

const SYSTEM_PROMPT = `You are a Destiny 2 expert answering questions for new and returning players.

You get two kinds of evidence:
- GAME DATA: rows from Bungie's manifest and AegisRelic's community spreadsheets. Exact stats, tiers, perks and damage numbers.
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
- Mention the update or date when a source is a patch note or announcement.`;

export type AnswerSource = {
  index: number;
  title: string;
  section: string;
  url: string;
  sourceName: string;
  score: number;
};

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

export async function answerQuestion(question: string, limit = 5): Promise<Answer> {
  const [hits, structured] = await Promise.all([
    searchGuides(question, limit),
    buildStructuredContext(question),
  ]);

  const parts = [
    structured ? `GAME DATA\n\n${structured}` : "",
    `WIKI SOURCES\n\n${formatSources(hits)}`,
    `Question: ${question}`,
  ].filter(Boolean);

  const answer = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: parts.join("\n\n") },
  ]);

  return {
    answer,
    dataVersion: await currentDataVersion(),
    sources: hits.map((hit, index) => ({
      index: index + 1,
      title: hit.title,
      section: hit.section,
      url: hit.url,
      sourceName: hit.sourceName,
      score: hit.score,
    })),
  };
}
