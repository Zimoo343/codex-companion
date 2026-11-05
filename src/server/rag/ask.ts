import { searchGuides, type GuideHit } from "./search.ts";

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
- Mention the update or date when the source is a patch note or announcement.`;

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
  for (const attempt of [model, fallbackModel].filter(Boolean)) {
    for (let tries = 1; tries <= 3; tries++) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: attempt, messages, temperature: 0.2 }),
      });

      if (response.ok) {
        const body = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        return body.choices[0]?.message.content ?? "";
      }

      const detail = await response.text();
      if (response.status < 500 || tries === 3) {
        console.error(`model ${attempt} failed: ${response.status} ${detail.slice(0, 200)}`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * tries));
    }
  }
  throw new Error("no model answered");
}

export async function ask(question: string, limit = 8) {
  const hits = await searchGuides(question, limit);
  const answer = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Sources:\n\n${formatSources(hits)}\n\nQuestion: ${question}` },
  ]);
  return { hits, answer };
}

if (import.meta.main || process.argv[1]?.endsWith("ask.ts")) {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('usage: node --env-file=.env.local src/server/rag/ask.ts "your question"');
    process.exit(1);
  }

  const { hits, answer } = await ask(question);

  console.log("--- retrieved ---");
  for (const [index, hit] of hits.entries()) {
    const score = hit.similarity.toFixed(3);
    const section = hit.section ? ` / ${hit.section}` : "";
    console.log(`${index + 1}. ${score}  ${hit.title}${section}  (${hit.sourceName})`);
  }

  console.log("\n--- answer ---");
  console.log(answer);

  console.log("\n--- citations ---");
  for (const hit of hits)
    console.log(`${hit.title}${hit.section ? ` / ${hit.section}` : ""} — ${hit.url}`);
}
