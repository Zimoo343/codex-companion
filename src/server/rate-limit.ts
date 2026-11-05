import { createDatabase } from "./db/client.ts";

export type RateLimitResult = { allowed: boolean; used: number; limit: number };

// A single counter row per visitor per day. Cheap, good enough for an invite-only
// demo, and it fails closed rather than open.
export async function consumeQuota(
  ip: string,
  limit = Number(process.env.DAILY_QUESTION_LIMIT ?? 40),
): Promise<RateLimitResult> {
  const { pool } = createDatabase();
  try {
    const result = await pool.query<{ count: number }>(
      `insert into rate_limits (ip, day, count) values ($1, current_date, 1)
       on conflict (ip, day) do update set count = rate_limits.count + 1
       returning count`,
      [ip],
    );
    const used = result.rows[0]?.count ?? limit + 1;
    return { allowed: used <= limit, used, limit };
  } finally {
    await pool.end();
  }
}
