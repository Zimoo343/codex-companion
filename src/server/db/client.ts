import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof createDatabase>["db"];

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set. Put it in .env.local.");

  const pool = new pg.Pool({ connectionString, max: 4 });
  return { db: drizzle(pool, { schema }), pool };
}
