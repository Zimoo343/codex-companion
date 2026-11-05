import { classifyEra, type Era } from "./era.ts";
import { createDatabase } from "../db/client.ts";

// Backfill only: re-classifying costs nothing at the provider because no text is
// re-embedded.
const { pool } = createDatabase();

const pending = await pool.query<{ id: number; title: string; content: string }>(
  `select id, title, content from guides where era = 'unknown'`,
);

const idsByEra = new Map<Era, number[]>();
for (const row of pending.rows) {
  const era = classifyEra(`${row.title}\n${row.content}`);
  idsByEra.set(era, [...(idsByEra.get(era) ?? []), row.id]);
}

for (const [era, ids] of idsByEra) {
  await pool.query(`update guides set era = $1 where id = any($2::int[])`, [era, ids]);
  console.log(`${era}: ${ids.length}`);
}

await pool.end();
console.log("classified", pending.rowCount);
