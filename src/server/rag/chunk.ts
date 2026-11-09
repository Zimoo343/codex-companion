// Turning patch notes and wiki pages into retrievable chunks. Everything here is
// pure so chunking experiments can be tested without network or database.

export type Section = { heading: string; text: string };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z][a-z0-9]*;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

// Announces heading boundaries so sections can be cut before tags are stripped.
export function htmlToMarkedText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*h[1-6][^>]*>/gi, "\n\n## ")
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*br[^>]*>/gi, "\n")
    .replace(/<\s*\/(p|div|tr|ul|ol|table|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

// Steam republishes Bungie's posts as BBCode, not HTML.
export function bbcodeToMarkedText(source: string): string {
  return source
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, " ")
    .replace(/\[h[1-6]\]/gi, "\n\n## ")
    .replace(/\[\/h[1-6]\]/gi, "\n")
    .replace(/\[\*\]/gi, "\n- ")
    .replace(/\[\/?li\]/gi, "\n")
    .replace(/\[br\s*\/?\]/gi, "\n")
    .replace(/\[\/?p\]/gi, "\n")
    .replace(/\[\/?(list|quote|code|table|tr)\]/gi, "\n")
    .replace(/\[td\]/gi, " | ")
    .replace(/\[\/td\]/gi, " ")
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[\/?(b|i|u|s|sub|sup|strike)\]/gi, "")
    .replace(/\[\/[a-z0-9*]+\]/gi, " ")
    .replace(/\[[a-z0-9*=][^\]]*\]/gi, " ");
}

export function looksLikeBbcode(text: string): boolean {
  return /\[\/?[a-z][a-z0-9]*[^\]]*\]/i.test(text);
}

export function markupToMarkedText(markup: string): string {
  return looksLikeBbcode(markup) ? bbcodeToMarkedText(markup) : htmlToMarkedText(markup);
}

export function collapseWhitespace(text: string): string {
  return (
    decodeEntities(text)
      // Wiki HTML is partly double-escaped, so decoding can reveal tags that the
      // earlier strip never saw. Remove whatever appears after decoding.
      .replace(/<\/?[a-z][^>]*>/gi, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function splitIntoSections(markup: string): Section[] {
  const marked = collapseWhitespace(markupToMarkedText(markup));
  const lines = marked.split("\n");

  const sections: Section[] = [];
  let heading = "";
  let buffer: string[] = [];

  const flush = () => {
    const text = collapseWhitespace(buffer.join("\n"));
    if (text.length > 0) sections.push({ heading, text });
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      heading = collapseWhitespace(line.slice(3));
      continue;
    }
    buffer.push(line);
  }

  flush();
  return sections;
}

export type ChunkOptions = { maxWords?: number; overlapWords?: number };

// Word-based windows keep chunks near a token budget without a tokenizer. The
// overlap stops a sentence that straddles a boundary from becoming unreadable.
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxWords = options.maxWords ?? 220;
  const overlapWords = options.overlapWords ?? 40;
  if (maxWords <= 0) throw new Error("maxWords must be positive");
  if (overlapWords >= maxWords) throw new Error("overlapWords must be smaller than maxWords");

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.length > 0 ? [words.join(" ")] : [];

  const chunks: string[] = [];
  const step = maxWords - overlapWords;
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + maxWords);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + maxWords >= words.length) break;
  }
  return chunks;
}

export type GuideChunk = { title: string; section: string; content: string };

export function buildChunks(
  title: string,
  markup: string,
  options: ChunkOptions = {},
): GuideChunk[] {
  const chunks: GuideChunk[] = [];

  for (const section of splitIntoSections(markup)) {
    for (const content of chunkText(section.text, options)) {
      chunks.push({ title, section: section.heading, content });
    }
  }

  return chunks;
}
