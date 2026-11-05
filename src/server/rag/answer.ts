import { searchGuides, type GuideHit } from "./search.ts";
import { createDatabase } from "../db/client.ts";

const baseUrl = (process.env.LLM_BASE_URL ?? "https://opencode.ai/inference/openai/v1").replace(
  /\/$/,
  "",
);
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const fallbackModel = process.env.LLM_FALLBACK_MODEL;

const SYSTEM_PROMPT = `You answer Destiny 2 questions using only the numbered sources given.

Rules:
- Cite sources as [1], [2] next to the claim they support.
- If the sources do not answer the question, say so. Do not fill gaps from memory.
- Plain language first, for a new or returning player. Short.
- Mention the update or date when the source is a patch note or announcement.
- If a source is about the original Destiny, say that instead of presenting it as Destiny 2.`;

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

export async function answerQuestion(question: string, limit = 8): Promise<Answer> {
  const hits = await searchGuides(question, limit);
  const answer = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Sources:\n\n${formatSources(hits)}\n\nQuestion: ${question}` },
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
