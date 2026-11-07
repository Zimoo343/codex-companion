import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Expansion = {
  name: string;
  free: boolean;
  bundle?: boolean;
  activities: string[];
  includes?: string[];
};

const expansions = JSON.parse(
  readFileSync(new URL("./expansions.json", import.meta.url), "utf8"),
) as Expansion[];

test("every entry has a name and activity list", () => {
  for (const expansion of expansions) {
    assert.ok(expansion.name.length > 0);
    assert.ok(Array.isArray(expansion.activities));
  }
});

test("bundles do not claim activities, so ownership stays unambiguous", () => {
  for (const expansion of expansions.filter((entry) => entry.bundle)) {
    assert.deepEqual(expansion.activities, [], `${expansion.name} must not list activities`);
    assert.ok((expansion.includes?.length ?? 0) > 0, `${expansion.name} must list includes`);
  }
});

test("no activity is claimed by two releases", () => {
  const owners = new Map<string, string>();

  for (const expansion of expansions.filter((entry) => !entry.bundle)) {
    for (const activity of expansion.activities) {
      const existing = owners.get(activity);
      assert.equal(existing ?? expansion.name, expansion.name, `${activity} claimed twice`);
      owners.set(activity, expansion.name);
    }
  }
});
