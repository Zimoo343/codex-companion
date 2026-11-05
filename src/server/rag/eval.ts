import { readFileSync } from "node:fs";
import { searchGuides } from "./search.ts";

type EvalQuestion = { question: string; expectedTitle: string };

const questions = JSON.parse(
  readFileSync(new URL("../../../evals/questions.json", import.meta.url), "utf8"),
) as EvalQuestion[];

const withAnswers = process.argv.includes("--answers");
let passed = 0;
const failures: Array<{ question: string; expected: string; got: string[]; rank: number | null }> =
  [];

for (const item of questions) {
  const hits = await searchGuides(item.question, 8);
  const rank = hits.findIndex((hit) =>
    hit.title.toLowerCase().includes(item.expectedTitle.toLowerCase()),
  );

  if (rank >= 0) {
    passed++;
    console.log(`PASS  ${item.question}`);
    continue;
  }

  failures.push({
    question: item.question,
    expected: item.expectedTitle,
    got: hits.slice(0, 3).map((hit) => hit.title),
    rank: null,
  });
  console.log(
    `FAIL  ${item.question}\n        expected ${item.expectedTitle}, got ${hits
      .slice(0, 3)
      .map((hit) => hit.title)
      .join(" | ")}`,
  );
}

const score = ((passed / questions.length) * 100).toFixed(0);
console.log(`\nretrieval hit@8: ${passed}/${questions.length} (${score}%)`);

if (failures.length > 0 && !withAnswers) {
  console.log("re-run with --answers to also generate answers for the failures");
}
