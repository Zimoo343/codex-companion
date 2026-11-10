import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCost, formatCost, readTokenPrices } from "./eval-cost.ts";

test("requires both price variables", () => {
  assert.equal(readTokenPrices({}), null);
  assert.equal(readTokenPrices({ EVAL_INPUT_PRICE_PER_MTOK: "0.75" }), null);
  assert.equal(readTokenPrices({ EVAL_OUTPUT_PRICE_PER_MTOK: "4.5" }), null);
});

test("rejects invalid and negative prices", () => {
  assert.equal(
    readTokenPrices({ EVAL_INPUT_PRICE_PER_MTOK: "nope", EVAL_OUTPUT_PRICE_PER_MTOK: "4.5" }),
    null,
  );
  assert.equal(
    readTokenPrices({ EVAL_INPUT_PRICE_PER_MTOK: "-1", EVAL_OUTPUT_PRICE_PER_MTOK: "4.5" }),
    null,
  );
});

test("parses valid prices including zero", () => {
  assert.deepEqual(
    readTokenPrices({ EVAL_INPUT_PRICE_PER_MTOK: "0.75", EVAL_OUTPUT_PRICE_PER_MTOK: "4.5" }),
    { inputPerMtok: 0.75, outputPerMtok: 4.5 },
  );
  assert.deepEqual(
    readTokenPrices({ EVAL_INPUT_PRICE_PER_MTOK: "0", EVAL_OUTPUT_PRICE_PER_MTOK: "0" }),
    { inputPerMtok: 0, outputPerMtok: 0 },
  );
});

test("estimates input and output cost separately", () => {
  const cost = estimateCost(1_000_000, 100_000, {
    inputPerMtok: 0.75,
    outputPerMtok: 4.5,
  });
  assert.equal(cost, 1.2);
});

test("formats cost to four decimals", () => {
  assert.equal(formatCost(0.1064), "$0.1064");
});
