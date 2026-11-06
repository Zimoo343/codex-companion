import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Cheap gate check so the invitation modal can validate before any question is asked.
export async function GET(request: Request) {
  const required = process.env.ACCESS_CODE;
  if (!required) return NextResponse.json({ ok: true, gate: false });

  const provided = request.headers.get("x-access-code") ?? "";
  return NextResponse.json(
    { ok: provided === required, gate: true },
    { status: provided === required ? 200 : 401 },
  );
}
