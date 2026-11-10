import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeAnswer, normalizeAnswer, type AnswerEval } from "./answer-eval.ts";

const base: AnswerEval = {
  id: "test",
  trap: "test",
  question: "test",
  expectFacts: [],
  forbid: [],
};

test("normalizes arrows and markdown", () => {
  assert.equal(normalizeAnswer("Melee → **Grenade**"), "melee > grenade");
});

test("passes when every fact group has an alternative", () => {
  const evaluation: AnswerEval = {
    ...base,
    expectFacts: ["Gjallarhorn|Apex Predator", "boss damage"],
  };
  const result = gradeAnswer(evaluation, "Apex Predator is the pick for boss damage.");
  assert.equal(result.passed, true);
  assert.deepEqual(result.missing, []);
});

test("reports missing fact groups", () => {
  const evaluation: AnswerEval = {
    ...base,
    expectFacts: ["Gjallarhorn|Apex Predator", "boss damage"],
  };
  const result = gradeAnswer(evaluation, "A rocket launcher is the pick.");
  assert.equal(result.passed, false);
  assert.deepEqual(result.missing, ["Gjallarhorn|Apex Predator", "boss damage"]);
});

test("fails on forbidden strings", () => {
  const evaluation: AnswerEval = {
    ...base,
    forbid: ["Starfire Protocol"],
  };
  const result = gradeAnswer(evaluation, "Starfire Protocol is a Warlock exotic.");
  assert.equal(result.passed, false);
  assert.deepEqual(result.forbiddenHits, ["Starfire Protocol"]);
});

test("matches retired stat order after normalizing arrows", () => {
  const evaluation: AnswerEval = {
    ...base,
    forbid: ["Resilience > Recovery"],
  };
  const result = gradeAnswer(evaluation, "Use Resilience → Recovery.");
  assert.deepEqual(result.forbiddenHits, ["Resilience > Recovery"]);
});

test("requires the expected refusal copy", () => {
  const evaluation: AnswerEval = {
    ...base,
    expectRefusal: "not_destiny",
  };
  assert.equal(gradeAnswer(evaluation, "I only answer Destiny 2 questions.").passed, true);
  assert.equal(gradeAnswer(evaluation, "Use flexbox.").passed, false);
});

test("detects missing live data", () => {
  const evaluation: AnswerEval = {
    ...base,
    expectRefusal: "no_live_data",
  };
  assert.equal(
    gradeAnswer(evaluation, "I don't have live vendor data, so I can't check Xur.").passed,
    true,
  );
});
