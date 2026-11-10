// Deterministic grading for answer-level evals. The model is judged on facts it
// must state, strings it must not state, and the refusal it should give.

export type RefusalKind = "not_destiny" | "no_live_data" | "no_popularity";

export type AnswerEval = {
  id: string;
  trap: string;
  question: string;
  history?: string;
  expectFacts: string[];
  forbid: string[];
  expectRefusal?: RefusalKind | null;
};

export type GradeResult = {
  passed: boolean;
  missing: string[];
  forbiddenHits: string[];
  refusalExpected: RefusalKind | null;
  refusalMatched: boolean | null;
};

const REFUSAL_PATTERNS: Record<RefusalKind, RegExp> = {
  not_destiny:
    /(?:only|just)\s+(?:answer|take|handle|cover)[^.]{0,40}destiny 2|destiny 2\s+(?:questions\s+)?only/i,
  no_live_data:
    /(?:don't|do not|doesn't|does not|cannot|can't|not able|no access to|no)\s+(?:have|access|provide|track|know)[^.]{0,80}(?:live|real-time|current|in-game|vendor|xur|rotation)|(?:live|real-time|current|in-game)[^.]{0,40}(?:data|state|inventory|stock)[^.]{0,20}(?:isn't|is not|not available|unavailable)|(?:not|no)\s+(?:live|real-time|current)[^.]{0,40}(?:data|state|information)|(?:isn't|is not|not)\s+in\s+(?:the\s+)?(?:evidence|data|sources)|(?:data|information|state)\s+(?:is\s+)?not\s+live|\bnot live\b/i,
  no_popularity:
    /(?:no|not|don't|doesn't|do not|does not|cannot|can't|nothing)[^.]{0,80}(?:usage|popularity|popular|track|measure|published)|published by|not measured/i,
};

export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[→🡒➔]/gu, ">")
    .replace(/[*_`[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFact(answer: string, group: string): boolean {
  const alternatives = group.split("|");
  return alternatives.some((alternative) => {
    const normalized = normalizeAnswer(alternative);
    return normalized.length > 0 && answer.includes(normalized);
  });
}

export function gradeAnswer(evaluation: AnswerEval, answer: string): GradeResult {
  const normalized = normalizeAnswer(answer);
  const missing = evaluation.expectFacts.filter((group) => !matchesFact(normalized, group));

  const forbiddenHits = evaluation.forbid.filter((text) => {
    const normalizedText = normalizeAnswer(text);
    return normalizedText.length > 0 && normalized.includes(normalizedText);
  });

  const refusalExpected = evaluation.expectRefusal ?? null;
  const refusalMatched = refusalExpected ? REFUSAL_PATTERNS[refusalExpected].test(answer) : null;

  return {
    passed:
      missing.length === 0 &&
      forbiddenHits.length === 0 &&
      (refusalMatched === null || refusalMatched),
    missing,
    forbiddenHits,
    refusalExpected,
    refusalMatched,
  };
}
