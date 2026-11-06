import { answerQuestion } from "./answer.ts";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('usage: pnpm ask "your question"');
  process.exit(1);
}

const { answer, sources, dataVersion } = await answerQuestion(question);

console.log("--- answer ---");
console.log(answer);

console.log("\n--- sources ---");
for (const source of sources) {
  const section = source.section ? ` / ${source.section}` : "";
  console.log(`[${source.index}] ${source.title}${section} — ${source.sourceName}`);
}

console.log(`\ndata: manifest ${dataVersion}`);
