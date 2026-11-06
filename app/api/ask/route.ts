import { prepareAnswer } from "../../../src/server/rag/answer.ts";
import { consumeQuota } from "../../../src/server/rate-limit.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const accessCode = process.env.ACCESS_CODE;

const baseUrl = (process.env.LLM_BASE_URL ?? "https://opencode.ai/inference/openai/v1").replace(
  /\/$/,
  "",
);
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const fallbackModel = process.env.LLM_FALLBACK_MODEL;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

const line = (payload: unknown) => `${JSON.stringify(payload)}\n`;

// Streams newline-delimited JSON: one meta event, then text deltas, then done.
export async function POST(request: Request) {
  if (accessCode && request.headers.get("x-access-code") !== accessCode) {
    return Response.json({ error: "Invite code required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    question?: string;
    history?: string;
  } | null;
  const question = body?.question?.trim();
  const history = (body?.history ?? "").slice(0, 2000);
  if (!question || question.length < 3) {
    return Response.json({ error: "Ask a question first." }, { status: 400 });
  }
  if (question.length > 500) {
    return Response.json({ error: "Question is too long." }, { status: 400 });
  }

  const quota = await consumeQuota(clientIp(request));
  if (!quota.allowed) {
    return Response.json(
      { error: `Daily limit reached (${quota.limit} questions). Try again tomorrow.` },
      { status: 429 },
    );
  }

  let prepared;
  try {
    prepared = await prepareAnswer(question, 5, history);
  } catch (error) {
    console.error("prepare failed", error);
    return Response.json({ error: "The companion could not answer right now." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          line({ type: "meta", sources: prepared.sources, dataVersion: prepared.dataVersion }),
        ),
      );

      try {
        const response = await openStream(prepared.messages);
        if (!response.ok || !response.body) {
          controller.enqueue(
            encoder.encode(
              line({ type: "delta", text: "The model is busy. Try again in a moment." }),
            ),
          );
          controller.enqueue(encoder.encode(line({ type: "done" })));
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            for (const rawLine of event.split("\n")) {
              if (!rawLine.startsWith("data:")) continue;
              const data = rawLine.slice(5).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const text = parsed.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(line({ type: "delta", text })));
              } catch {
                // Ignore keep-alive and malformed frames.
              }
            }
          }
        }

        controller.enqueue(encoder.encode(line({ type: "done" })));
      } catch (error) {
        console.error("stream failed", error);
        controller.enqueue(
          encoder.encode(line({ type: "delta", text: "\n\nConnection dropped." })),
        );
        controller.enqueue(encoder.encode(line({ type: "done" })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function openStream(messages: Array<{ role: string; content: string }>) {
  let last: Response | null = null;

  for (const candidate of [model, fallbackModel].filter(Boolean)) {
    last = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: candidate, messages, temperature: 0.2, stream: true }),
    });
    if (last.ok) return last;
  }

  return last ?? new Response(null, { status: 500 });
}
