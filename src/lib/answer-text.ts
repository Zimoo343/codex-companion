// Safety net for a model that slips into pipeline language. Runs over the whole
// answer, so a phrase split across stream chunks is still caught.

const REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /(?:based on|from|in|according to) the data you (?:gave|provided|shared)/gi,
    "according to the community sources",
  ],
  [/the data you (?:gave|provided|shared)/gi, "the community data"],
  [/the provided (?:data|sources|information)/gi, "the sources"],
  [/your (?:data|list|input)\b/gi, "the community data"],
  [/\bin this set\b/gi, "in the sources"],
];

export function sanitizeAnswer(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
