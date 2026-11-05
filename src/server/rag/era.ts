// Destinypedia covers Destiny 1 and Destiny 2 in the same articles, and has no
// category that separates them. Era is inferred from wording instead.

export type Era = "d1" | "d2" | "both" | "unknown";

const D1_MARKERS =
  /\b(rise of iron|the taken king|the dark below|house of wolves|destiny 1|year one|year two|year three|year 1|year 2|year 3|grimoire|prison of elders|sparrow racing league|vault of glass \(destiny 1\))\b/i;

const D2_MARKERS =
  /\b(destiny 2|season of|annual pass|lightfall|the final shape|the witch queen|beyond light|shadowkeep|forsaken|the edge of fate|renegades|guardian games|eververse|artifact|subclass|aspect|fragment)\b/i;

export function classifyEra(text: string): Era {
  const hasD1 = D1_MARKERS.test(text);
  const hasD2 = D2_MARKERS.test(text);

  if (hasD1 && hasD2) return "both";
  if (hasD1) return "d1";
  if (hasD2) return "d2";
  return "unknown";
}
