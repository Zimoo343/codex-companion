// Audience is inferred from how the question is written, then used to adjust how much
// detail the answer carries. Nothing here changes facts, only register and depth.

export type Audience = "new" | "returning" | "endgame" | "unknown";

const ENDGAME =
  /\b(lowman|low man|low-man|speedrun|speed run|contest mode|day one|grandmaster|gm\b|solo flawless|solo run|duo\b|trio\b|master raid|master dungeon|dps phase|god ?roll|transcendence|damage rotation|strat|strategy|loadout|breakpoint)/i;

const RETURNING =
  /\b(returning|came back|come back|coming back|haven'?t played since|used to play|back after|stopped playing)/i;

const NEW =
  /\b(new player|new light|just started|just downloaded|just installed|just got (?:the game|d2)|first time playing|beginner|brand new|i'?m new|noob|never played|start(ing)? out|what should i do first)/i;

export function classifyAudience(text: string): Audience {
  // Endgame vocabulary is the strongest signal: a new player does not ask about lowmans.
  if (ENDGAME.test(text)) return "endgame";
  if (RETURNING.test(text)) return "returning";
  if (NEW.test(text)) return "new";
  return "unknown";
}

const RULES: Record<Audience, string> = {
  new: `Audience: new or casual player.
- Plain language. No percentages, breakpoints, stat thresholds or damage numbers unless they ask for them.
- Explain a term the first time it is used, in a few words, in the same sentence.
- Give one clear next step they can do in game, not a menu of options.
- Do not dump a full build sheet. Name at most three things: the exotic, the subclass, and where to go. Even when GAME DATA contains aspects and fragments, do not reproduce those lists for a new player unless they asked for them.`,
  returning: `Audience: returning player.
- Be concise. They know the game, not what changed.
- Lead with what is different now compared with when they left, then the answer.
- Skip beginner explanations and skip long build dumps.`,
  endgame: `Audience: endgame player.
- Assume vocabulary; skip explanations of basic terms.
- Be precise: triggers, cooldowns, stat breakpoints, damage numbers, and the exact source.
- State tradeoffs and conditions, not just the pick.
- Strats and loadouts should name the encounter or activity they apply to.
- If the data has no endgame-specific strat or lowman route, say that plainly. Never present a general build as a lowman or speedrun setup, and do not label it speedrun-focused: say the recorded build is a general one and that no lowman route is in the data.`,
  unknown: "",
};

export function audienceRules(audience: Audience): string {
  return RULES[audience];
}

export function resolveAudience(question: string, history = ""): Audience {
  return classifyAudience(`${history}\n${question}`);
}
