// These two community sheets are organised as several stacked tables per tab: a
// section title row, then a header row, then data, repeated. This parses that shape.

export type SheetSection = {
  section: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

const nonEmpty = (row: string[]) => row.filter((cell) => cell.trim() !== "").length;

export function parseSections(rows: string[][]): SheetSection[] {
  const sections: SheetSection[] = [];
  let section = "";
  let headers: string[] = [];

  for (const row of rows) {
    const filled = nonEmpty(row);

    if (filled === 0) continue;

    if (filled === 1) {
      // A lone cell is a section title. It also resets the current table.
      section = row.find((cell) => cell.trim() !== "")?.trim() ?? section;
      headers = [];
      continue;
    }

    const looksLikeHeader =
      headers.length === 0 ||
      row.every((cell) => cell.trim() === "" || !/^\d+(\.\d+)?%?$/.test(cell.trim()));

    if (looksLikeHeader && headers.length === 0) {
      headers = normalizeHeaders(row);
      continue;
    }

    if (headers.length === 0) headers = normalizeHeaders(row);

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
