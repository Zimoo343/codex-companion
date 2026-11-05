import { createHash } from "node:crypto";

export type EmbeddingProvider = {
  name: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
};

const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const BATCH_SIZE = 64;

export function createOpenAiEmbeddings(
  dimensions = 1536,
  model = "text-embedding-3-small",
  apiKey = process.env.OPENAI_API_KEY,
): EmbeddingProvider {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Put it in .env.local.");

  // New accounts are limited to ~1M tokens per minute. Backing off on 429 keeps a
  // full ingestion run from dying halfway through.
  async function embedWithRetry(batch: string[], attempt = 1): Promise<Response> {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: batch, dimensions }),
    });

    if (response.ok) return response;

    const detail = await response.text();
    if (response.status === 429 && attempt <= 6) {
      const retryAfter = Number(response.headers.get("retry-after")) * 1000;
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2000 * attempt;
      console.warn(`rate limited, waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return embedWithRetry(batch, attempt + 1);
    }

    throw new Error(`embeddings failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  return {
    name: model,
    dimensions,
    async embed(texts) {
      const vectors: number[][] = [];

      for (let index = 0; index < texts.length; index += BATCH_SIZE) {
        const batch = texts.slice(index, index + BATCH_SIZE);
        const response = await embedWithRetry(batch);

        const body = (await response.json()) as {
          data: Array<{ index: number; embedding: number[] }>;
        };

        for (const item of [...body.data].sort((a, b) => a.index - b.index)) {
          vectors.push(item.embedding);
        }
      }

      return vectors;
    },
  };
}

// Same text in, same hash out, so re-ingesting an unchanged document embeds nothing.
export function contentHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}
