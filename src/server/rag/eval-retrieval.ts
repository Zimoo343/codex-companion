import { readFileSync } from "node:fs";
import { buildStructuredContext } from "./context.ts";
import { embedQuestion, searchEntities, searchGuidesByVector } from "./search.ts";

// Retrieval evals check whether the right evidence reaches the model at all. They make no
// model call: one embedding per question plus SQL. Cheap enough to run on every commit.

type Case = {
  id: string;
  question: string;
  expectGuides: string[];
  expectEntities: string[];
  expectBlocks?: string[];
};

const cases = JSON.parse(
  readFileSync(new URL("../../../evals/retrieval.json", import.meta.url), "utf8"),
) as Case[];

const onlyFlag = process.argv.indexOf("--only");
const only = onlyFlag > 0 ? process.argv[onlyFlag + 1] : null;

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const contains = (haystack: string, needle: string) =>
  normalise(haystack).includes(normalise(needle));

let passed = 0;
let guideRanks: number[] = [];
let entityRanks: number[] = [];
let blockTotal = 0;
let blockPassed = 0;

for (const testCase of cases) {
  if (only && testCase.id !== only) continue;

  const vector = await embedQuestion(testCase.question);
  const guides = await searchGuidesByVector(vector, testCase.question, 8, 2);
  const entities = await searchEntities(vector, 6);

  const guideMisses: string[] = [];
  for (const expected of testCase.expectGuides) {
    const index = guides.findIndex(
      (hit) => contains(hit.title, expected) || contains(hit.section, expected),
    );
    if (index === -1) guideMisses.push(expected);
    else guideRanks.push(index + 1);
  }

  const entityMisses: string[] = [];
  for (const expected of testCase.expectEntities) {
    const index = entities.findIndex((hit) => contains(hit.name, expected));
    if (index === -1) entityMisses.push(expected);
    else entityRanks.push(index + 1);
  }

  const blockMisses: string[] = [];
  if (testCase.expectBlocks && testCase.expectBlocks.length > 0) {
    const context = await buildStructuredContext(testCase.question);
    for (const expected of testCase.expectBlocks) {
      blockTotal += 1;
      if (contains(context.text, expected)) blockPassed += 1;
      else blockMisses.push(expected);
    }
  }

  const ok = guideMisses.length === 0 && entityMisses.length === 0 && blockMisses.length === 0;
  if (ok) passed += 1;

  const label = ok ? "PASS" : "FAIL";
  console.log(`${label}  ${testCase.id}`);
  if (!ok) {
    if (guideMisses.length) console.log(`  guides missing: ${guideMisses.join(", ")}`);
    if (entityMisses.length) console.log(`  entities missing: ${entityMisses.join(", ")}`);
    if (blockMisses.length) console.log(`  blocks missing: ${blockMisses.join(", ")}`);
    if (guides.length) console.log(`  top guides: ${guides.map((hit) => hit.title).join(" | ")}`);
    if (entities.length)
      console.log(`  top entities: ${entities.map((hit) => hit.name).join(" | ")}`);
  }
}

const total = only ? 1 : cases.length;
const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

console.log(`\nretrieval evals: ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);
console.log(`guide MRR: ${mean(guideRanks.map((rank) => 1 / rank)).toFixed(2)}`);
console.log(`entity MRR: ${mean(entityRanks.map((rank) => 1 / rank)).toFixed(2)}`);
if (blockTotal > 0) console.log(`resolver routing: ${blockPassed}/${blockTotal}`);
console.log("cost: embeddings only, no model calls");
