import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit only loads `.env`, and `.env.local` is where secrets live.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match?.[1] && match[2] && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Put it in .env.local.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
