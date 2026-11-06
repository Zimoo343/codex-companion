import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// A `\b` word boundary has twice been written as a literal backspace byte, which turns
// regexes into silent no-ops. Numbers in the sources are easy to break, hard to see.
function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(path);
  }

  return files;
}

test("source files contain no stray control characters", () => {
  const offenders: string[] = [];

  for (const root of ["app", "src"]) {
    for (const file of sourceFiles(root)) {
      const bytes = readFileSync(file);
      if (bytes.includes(0x08)) offenders.push(file);
    }
  }

  assert.deepEqual(offenders, [], `backspace byte found in: ${offenders.join(", ")}`);
});
