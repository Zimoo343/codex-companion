// User text is data, not instructions. This is a cheap tripwire for the obvious
// attempts, and the prompt adds a second, softer layer behind it.

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)\b/i,
  /\bdisregard\s+(all\s+)?(previous|prior|above|your)\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(developer|dan|god)\s+mode\b/i,
  /\bjailbreak\b/i,
  /\breveal\s+(your|the)\s+(prompt|instructions|rules)\b/i,
  /\b(repeat|print|show)\s+(the\s+)?(above|system|instructions)\b/i,
  /\bpretend\s+(to\s+be|you\s+are)\b/i,
  /\bnew\s+instructions?\s*:/i,
];

export function looksLikeInjection(question: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(question));
}

export const INJECTION_REFUSAL =
  "I only answer Destiny 2 questions from the data behind this app. I can't take new instructions or change how I work.";
