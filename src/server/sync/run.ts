import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import { createDatabase } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { buildManifestBundle, extractZipEntry, fetchManifest } from "./manifest.ts";
import {
  AEGIS_TABS,
  buildAegisArchetypes,
  buildAegisWeapons,
  fetchSheetRows,
  type AegisWeaponRow,
} from "./sheets.ts";
import externalTools from "./external-tools.json" with { type: "json" };
import { syncCommunitySheets } from "./sheets-extra.ts";
import { ingestClassItemSheet } from "./sheets-classitems.ts";

const CHUNK = 200;

async function insertAll<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += CHUNK) {
    await insert(rows.slice(index, index + CHUNK));
  }
}

async function latestVersion(db: ReturnType<typeof createDatabase>["db"], kind: string) {
  const rows = await db
    .select({ version: schema.syncRuns.version })
    .from(schema.syncRuns)
    .where(eq(schema.syncRuns.kind, kind))
    .orderBy(desc(schema.syncRuns.startedAt))
    .limit(1);
  return rows[0]?.version ?? null;
}

async function syncManifest() {
  const { db, pool } = createDatabase();
  const started = Date.now();

  const { version, zip } = await fetchManifest();
  const known = await latestVersion(db, "manifest");

  if (known === version && !process.env.FORCE) {
    console.log(`manifest ${version} already imported, skipping`);
    await pool.end();
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "codex-companion-"));
  const manifestPath = join(workDir, "world.sqlite");
  writeFileSync(manifestPath, extractZipEntry(zip));

  const manifestDb = new DatabaseSync(manifestPath, { readOnly: true });
  const bundle = buildManifestBundle(manifestDb, version);
  manifestDb.close();
  rmSync(workDir, { recursive: true, force: true });

  console.log(`manifest ${version}: ${(zip.length / 1e6).toFixed(0)}MB downloaded`);

  await db.transaction(async (tx) => {
    await tx.delete(schema.weapons);
    await tx.delete(schema.armor);
    await tx.delete(schema.subclassPlugs);
    await tx.delete(schema.activities);

    await insertAll(bundle.weapons, (chunk) => tx.insert(schema.weapons).values(chunk));
    await insertAll(bundle.armor, (chunk) => tx.insert(schema.armor).values(chunk));
    await insertAll(bundle.plugs, (chunk) =>
      tx.insert(schema.subclassPlugs).values(chunk).onConflictDoNothing(),
    );
    await insertAll(bundle.activities, (chunk) => tx.insert(schema.activities).values(chunk));

    await tx.insert(schema.syncRuns).values({
      kind: "manifest",
      version,
      status: "ok",
      detail: {
        weapons: bundle.weapons.length,
        armor: bundle.armor.length,
        plugs: bundle.plugs.length,
        activities: bundle.activities.length,
        seconds: Math.round((Date.now() - started) / 1000),
      },
      finishedAt: new Date(),
    });
  });

  console.log(
    `weapons ${bundle.weapons.length}, armor ${bundle.armor.length}, ` +
      `plugs ${bundle.plugs.length}, activities ${bundle.activities.length}`,
  );

  await pool.end();
}

async function syncSheets() {
  const { db, pool } = createDatabase();
  const started = Date.now();

  const weapons: AegisWeaponRow[] = [];
  let archetypes: ReturnType<typeof buildAegisArchetypes> = [];

  for (const tab of AEGIS_TABS) {
    const rows = await fetchSheetRows(tab);
    if (tab === "Archetypes") {
      archetypes = buildAegisArchetypes(rows);
      continue;
    }
    const parsed = buildAegisWeapons(tab, rows);
    console.log(`sheet ${tab}: ${parsed.length} rows`);
    weapons.push(...parsed);
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.aegisWeapons);
    await tx.delete(schema.aegisArchetypes);

    await insertAll(weapons, (chunk) => tx.insert(schema.aegisWeapons).values(chunk));
    await insertAll(archetypes, (chunk) => tx.insert(schema.aegisArchetypes).values(chunk));

    await tx.insert(schema.syncRuns).values({
      kind: "sheets",
      version: new Date().toISOString().slice(0, 10),
      status: "ok",
      detail: {
        aegisWeapons: weapons.length,
        aegisArchetypes: archetypes.length,
        seconds: Math.round((Date.now() - started) / 1000),
      },
      finishedAt: new Date(),
    });
  });

  console.log(`aegis_weapons ${weapons.length}, aegis_archetypes ${archetypes.length}`);
  await pool.end();
}

async function seedReferenceData() {
  const { db, pool } = createDatabase();

  await db.transaction(async (tx) => {
    await tx.delete(schema.externalTools);
    await tx.insert(schema.externalTools).values(externalTools);

    await tx
      .insert(schema.sources)
      .values([
        {
          name: "Bungie Destiny 2 Manifest",
          url: "https://www.bungie.net/Platform/Destiny2/Manifest/",
          credit: "Bungie",
          licenseNote: "Official game data. Not redistributed as raw dumps.",
        },
        {
          name: "AegisRelic Endgame Analysis",
          url: "https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY",
          credit: "AegisRelic",
          licenseNote: "Community work. Credited and linked, never re-hosted.",
        },
        {
          name: "Destiny Data Compendium",
          url: "https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4",
          credit: "Destiny Data Compendium contributors",
          licenseNote: "Community work. Credited and linked, never re-hosted.",
        },
      ])
      .onConflictDoNothing();
  });

  console.log(`external_tools ${externalTools.length}, sources seeded`);
  await pool.end();
}

const target = process.argv[2] ?? "all";

if (target === "all" || target === "manifest") await syncManifest();
if (target === "all" || target === "sheets") await syncSheets();
if (target === "all" || target === "community") {
  const counts = await syncCommunitySheets();
  for (const [source, count] of Object.entries(counts)) console.log(`${source}: ${count} rows`);
}
if (target === "all" || target === "classitems") {
  const result = await ingestClassItemSheet();
  console.log(`class_item_combos ${result.combos}, builds ${result.builds}`);
}
if (target === "all" || target === "reference") await seedReferenceData();
