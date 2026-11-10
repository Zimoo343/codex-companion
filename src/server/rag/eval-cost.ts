export type TokenPrices = {
  inputPerMtok: number;
  outputPerMtok: number;
};

export function readTokenPrices(
  env: Record<string, string | undefined> = process.env,
): TokenPrices | null {
  const input = env.EVAL_INPUT_PRICE_PER_MTOK?.trim();
  const output = env.EVAL_OUTPUT_PRICE_PER_MTOK?.trim();
  if (!input || !output) return null;

  const inputPerMtok = Number(input);
  const outputPerMtok = Number(output);
  if (!Number.isFinite(inputPerMtok) || !Number.isFinite(outputPerMtok)) return null;
  if (inputPerMtok < 0 || outputPerMtok < 0) return null;

  return { inputPerMtok, outputPerMtok };
}

export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  prices: TokenPrices,
): number {
  return (
    (promptTokens / 1e6) * prices.inputPerMtok + (completionTokens / 1e6) * prices.outputPerMtok
  );
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
