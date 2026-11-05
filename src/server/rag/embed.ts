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

  return {
    name: model,
    dimensions,
    async embed(texts) {
      const vectors: number[][] = [];

      for (let index = 0; index < texts.length; index += BATCH_SIZE) {
        const batch = texts.slice(index, index + BATCH_SIZE);
        const response = await fetch(OPENAI_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, input: batch, dimensions }),
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`embeddings failed: ${response.status} ${detail.slice(0, 300)}`);
        }

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
