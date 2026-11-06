// These two community sheets are organised as several stacked tables per tab: a
// section title row, then a header row, then data, repeated. This parses that shape.

export type SheetSection = {
  section: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

const nonEmpty = (row: string[]) => row.filter((cell) => cell.trim() !== "").length;

// A header row names its columns. Rows of short labels like "Weapon Traits" or
// "Hunters / Titans / Warlocks" are section dividers wearing a header's clothes.
const HEADER_WORDS =
  /^(perk|name|boss|tier|weapon|weapons|armor|description|notes|ability|abilities|stat|stats|mod|mods|rank|ranking|type|value|source|damage|health|activity|icon|item|category|phase|setup|model|species|mechanics|range|adds|season|class|element|cost|effect)$/i;

const isHeaderText = (row: string[]) => row.some((cell) => HEADER_WORDS.test(cell.trim()));

export function parseSections(rows: string[][]): SheetSection[] {
  const sections: SheetSection[] = [];
  let section = "";
  let headers: string[] = [];
  // Sections often share one header band at the top of the tab, so remember the
  // last header seen for each row width and reuse it.
  const lastHeaders = new Map<number, string[]>();

  for (const row of rows) {
    const filled = nonEmpty(row);

    if (filled === 0) continue;

    if (filled === 1) {
      // A lone cell is a section title. It also resets the current table.
      section = row.find((cell) => cell.trim() !== "")?.trim() ?? section;
      headers = [];
      continue;
    }

    // A real header row is made of short labels. Some tables have no header at all,
    // and some "title" rows carry a whole sentence, so a long cell means data.
    const looksLikeHeader =
      headers.length === 0 &&
      row.every((cell) => cell.trim() === "" || (cell.trim().length <= 40 && !cell.includes("\n")));

    if (looksLikeHeader && isHeaderText(row)) {
      headers = normalizeHeaders(row);
      if (!lastHeaders.has(row.length)) lastHeaders.set(row.length, headers);
      continue;
    }

    if (looksLikeHeader && !isHeaderText(row)) {
      // Short labels but no column names: a divider, not a header.
      section = row.filter((cell) => cell.trim() !== "").join(" / ");
      headers = [];
      continue;
    }

    if (headers.length === 0) {
      headers =
        lastHeaders.get(row.length) ?? normalizeHeaders(row.map((_, index) => `col_${index}`));
    }

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = (row[index] ?? "").trim();
      if (value !== "") record[header] = value;
    });

    if (Object.keys(record).length >= 2) {
      sections.push({ section, headers, rows: [record] });
    }
  }

  return mergeSections(sections);
}

export function normalizeHeaders(row: string[]): string[] {
  const seen = new Map<string, number>();
  return row.map((cell, index) => {
    const base = cell.trim().replace(/\s+/g, " ") || `col_${index}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

// One section per header band, so callers get contiguous tables.
function mergeSections(sections: SheetSection[]): SheetSection[] {
  const merged: SheetSection[] = [];
  for (const entry of sections) {
    const last = merged.at(-1);
    if (
      last &&
      last.section === entry.section &&
      last.headers.join("|") === entry.headers.join("|")
    ) {
      last.rows.push(...entry.rows);
      continue;
    }
    merged.push({ section: entry.section, headers: [...entry.headers], rows: [...entry.rows] });
  }
  return merged;
}
