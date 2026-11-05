import { NextResponse } from "next/server";
import { answerQuestion } from "../../../src/server/rag/answer.ts";
import { consumeQuota } from "../../../src/server/rate-limit.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const accessCode = process.env.ACCESS_CODE;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  if (accessCode && request.headers.get("x-access-code") !== accessCode) {
    return NextResponse.json({ error: "Invite code required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim();
  if (!question || question.length < 3) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long." }, { status: 400 });
  }

  const quota = await consumeQuota(clientIp(request));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached (${quota.limit} questions). Try again tomorrow.` },
      { status: 429 },
    );
  }

  try {
    const result = await answerQuestion(question);
    return NextResponse.json(result);
  } catch (error) {
    console.error("ask failed", error);
    return NextResponse.json(
      { error: "The companion could not answer right now." },
      { status: 500 },
    );
  }
}
