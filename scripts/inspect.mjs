// Read-only inspector for the RAG database. Nothing here writes.
//   node --env-file=.env.local scripts/inspect.mjs tables
//   node --env-file=.env.local scripts/inspect.mjs sample entities
//   node --env-file=.env.local scripts/inspect.mjs search "best rocket launcher"
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing. Use --env-file=.env.local");

const pool = new pg.Pool({ connectionString: url, max: 2 });
const [command, ...rest] = process.argv.slice(2);

async function tables() {
  const result = await pool.query(`
    select table_name,
           (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text::int as rows
      from information_schema.tables
     where table_schema = 'public'
     order by rows desc
  `);
  for (const row of result.rows) console.log(String(row.rows).padStart(6), row.table_name);
}

async function sample(table = "entities", limit = "3") {
  if (!/^[a-z_]+$/.test(table)) throw new Error("table name only");
  const result = await pool.query(`select * from ${table} limit ${Number(limit)}`);
  for (const row of result.rows) {
    const printable = { ...row };
    if (Array.isArray(printable.embedding)) printable.embedding = `[${printable.embedding.length} dims]`;
    if (printable.embedding) printable.embedding = "[vector]";
    console.log(JSON.stringify(printable, null, 2).slice(0, 1200), "\n");
  }
}

async function search(question) {
  if (!question) throw new Error('ask something: search "best rocket"');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const embedded = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: [question] }),
  }).then((response) => response.json());

  const vector = `[${embedded.data[0].embedding.join(",")}]`;

  for (const table of ["entities", "guides"]) {
    const text = table === "guides" ? "content" : "text";
    const result = await pool.query(
      `select ${table === "guides" ? "title" : "kind"} as kind, ${table === "guides" ? "title" : "name"} as label,
              left(${text}, 220) as preview, 1 - (embedding <=> $1::vector) as similarity
         from ${table}
        where embedding is not null
        order by embedding <=> $1::vector
        limit 5`,
      [vector],
    );

    console.log(`\n== ${table}`);
    for (const row of result.rows) {
      console.log(`${row.similarity.toFixed(3)}  [${row.kind}] ${row.label}`);
      console.log(`   ${String(row.preview).replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }
}

const run = { tables, sample, search }[command];
if (!run) {
  console.log("usage: tables | sample <table> | search \"question\"");
  process.exit(1);
}

await run(...rest);
await pool.end();
