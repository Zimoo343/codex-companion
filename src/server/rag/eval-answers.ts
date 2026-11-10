import { readFileSync, writeFileSync } from "node:fs";
import { answerQuestion } from "./answer.ts";
import { gradeAnswer, type AnswerEval } from "./answer-eval.ts";
import { estimateCost, formatCost, readTokenPrices } from "./eval-cost.ts";

type EvalResult = {
  id: string;
  question: string;
  history: string;
  answer: string;
  passed: boolean;
  missing: string[];
  forbiddenHits: string[];
  refusalExpected: string | null;
  refusalMatched: boolean | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  seconds: number;
};

const questions = JSON.parse(
  readFileSync(new URL("../../../evals/answers.json", import.meta.url), "utf8"),
) as AnswerEval[];

const CONFIRM_ABOVE = 5;

function averageTokensPerQuestion(): { promptTokens: number; completionTokens: number } {
  const fallback = { promptTokens: 6000, completionTokens: 200 };
  try {
    const baseline = JSON.parse(
      readFileSync(new URL("../../../evals/answers-baseline.json", import.meta.url), "utf8"),
    ) as { results?: Array<{ promptTokens?: number; completionTokens?: number }> };
    const rows = (baseline.results ?? []).filter(
      (row) => typeof row.promptTokens === "number" && row.promptTokens > 0,
    );
    if (rows.length === 0) return fallback;

    let promptTokens = 0;
    let completionTokens = 0;
    for (const row of rows) {
      promptTokens += row.promptTokens ?? 0;
      completionTokens += row.completionTokens ?? 0;
    }
    return {
      promptTokens: promptTokens / rows.length,
      completionTokens: completionTokens / rows.length,
    };
  } catch {
    return fallback;
  }
}

const args = process.argv.slice(2);
const saveBaseline = args.includes("--baseline");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
const selected = only ? questions.filter((item) => item.id === only) : questions;

if (selected.length === 0) {
  console.error(only ? `no eval named "${only}"` : "no evals found");
  process.exit(1);
}

const prices = readTokenPrices();
if (selected.length > CONFIRM_ABOVE && !args.includes("--yes")) {
  const average = averageTokensPerQuestion();
  const promptTokens = Math.round(average.promptTokens * selected.length);
  const completionTokens = Math.round(average.completionTokens * selected.length);

  console.error(`refusing a ${selected.length}-question run without --yes.`);
  console.error(`estimate: prompt ${promptTokens}, completion ${completionTokens} tokens`);
  if (prices) {
    console.error(
      `estimated cost: ${formatCost(estimateCost(promptTokens, completionTokens, prices))}`,
    );
  } else {
    console.error(
      "set EVAL_INPUT_PRICE_PER_MTOK and EVAL_OUTPUT_PRICE_PER_MTOK for a dollar estimate",
    );
  }
  console.error("use --only <id> for one case, or add --yes for the full set.");
  process.exit(1);
}

const results: EvalResult[] = [];
const failures: EvalResult[] = [];

for (const item of selected) {
  const started = Date.now();
  let result: EvalResult;

  try {
    const answer = await answerQuestion(item.question, 5, item.history ?? "");
    const grade = gradeAnswer(item, answer.answer);
    result = {
      id: item.id,
      question: item.question,
      history: item.history ?? "",
      answer: answer.answer,
      passed: grade.passed,
      missing: grade.missing,
      forbiddenHits: grade.forbiddenHits,
      refusalExpected: grade.refusalExpected,
      refusalMatched: grade.refusalMatched,
      promptTokens: answer.usage.promptTokens,
      completionTokens: answer.usage.completionTokens,
      totalTokens: answer.usage.totalTokens,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
  } catch (error) {
    result = {
      id: item.id,
      question: item.question,
      history: item.history ?? "",
      answer: "",
      passed: false,
      missing: ["model call failed"],
      forbiddenHits: [],
      refusalExpected: item.expectRefusal ?? null,
      refusalMatched: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
    console.error(`ERROR ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
  }

  results.push(result);

  if (result.passed) {
    console.log(`PASS  ${result.id}`);
    continue;
  }

  failures.push(result);
  console.log(`FAIL  ${result.id} — ${item.trap}`);
  if (result.missing.length > 0) console.log(`        missing: ${result.missing.join("; ")}`);
  if (result.forbiddenHits.length > 0) {
    console.log(`        forbidden: ${result.forbiddenHits.join(", ")}`);
  }
  if (result.refusalExpected && result.refusalMatched === false) {
    console.log(`        expected refusal: ${result.refusalExpected}`);
  }
  console.log(`        answer: ${result.answer.replace(/\s+/g, " ").slice(0, 420)}`);
}

const passed = results.filter((result) => result.passed).length;
const score = ((passed / results.length) * 100).toFixed(0);
const promptTokens = results.reduce((sum, result) => sum + result.promptTokens, 0);
const completionTokens = results.reduce((sum, result) => sum + result.completionTokens, 0);
const totalTokens = results.reduce((sum, result) => sum + result.totalTokens, 0);

console.log(`\nanswer eval: ${passed}/${results.length} (${score}%)`);
console.log(`tokens: prompt ${promptTokens}, completion ${completionTokens}, total ${totalTokens}`);

if (prices) {
  console.log(
    `estimated cost: ${formatCost(estimateCost(promptTokens, completionTokens, prices))}`,
  );
} else {
  console.log("cost: set EVAL_INPUT_PRICE_PER_MTOK and EVAL_OUTPUT_PRICE_PER_MTOK to estimate");
}

if (saveBaseline) {
  const output = {
    generatedAt: new Date().toISOString(),
    model: process.env.LLM_MODEL ?? "unknown",
    results,
  };
  writeFileSync(
    new URL("../../../evals/answers-baseline.json", import.meta.url),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  console.log("wrote evals/answers-baseline.json");
}

if (failures.length > 0 && !saveBaseline) {
  process.exitCode = 1;
}
