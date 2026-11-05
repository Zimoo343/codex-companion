// Throwaway spike: pull Bungie manifest + AegisRelic sheets into a local SQLite file.
// Run: node spike/sync.mjs
import { DatabaseSync } from "node:sqlite";
import { inflateRawSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifestTables } from "./manifest-tables.mjs";

const BUNGIE = "https://www.bungie.net";
const AEGIS_SHEET_ID = "1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY";
const AEGIS_TABS = ["Archetypes", "HGLs", "LFRs", "LMGs", "Rockets", "Autos", "Bows", "HCs", "Pulses", "Scouts", "Sidearms", "SMGs", "BGLs", "Fusions", "Glaives", "Shotguns", "Snipers", "Rocket Sidearms", "Traces", "Swords", "Other"];
const DB_PATH = process.env.SPIKE_DB ?? new URL("./game.db", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Bungie ships the world-content SQLite as a single-entry zip. Pull it out by hand, no deps.
function extractSingleZipFile(zipBuffer) {
  if (zipBuffer.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
  const method = zipBuffer.readUInt16LE(8);
  const compressedSize = zipBuffer.readUInt32LE(18);
  const nameLength = zipBuffer.readUInt16LE(26);
  const extraLength = zipBuffer.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;

  if (compressedSize === 0) throw new Error("zip entry uses data descriptor, unsupported");
  const body = zipBuffer.subarray(start, start + compressedSize);
  return method === 0 ? body : inflateRawSync(body);
}

// Minimal CSV parser. Handles quoted fields, embedded commas and newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchAegisTab(tab) {
  const url = `https://docs.google.com/spreadsheets/d/${AEGIS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for tab ${tab}`);
  return parseCsv(await res.text());
}

function slugColumn(header, index) {
  const slug = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(values|calculations)_/, "");
  return slug ? slug : `col_${index}`;
}

// The Archetypes tab holds the per-frame damage math: base damage, scalars,
// intervals, MDPS/BDPS columns and a tier. Column set is wide and changes
// upstream, so build the table from its own header row instead of hardcoding.
function buildAegisArchetypes(db, rows) {
  const header = rows[0];
  const columns = header.map(slugColumn);
  const unique = columns.map((name, index) => (columns.indexOf(name) === index ? name : `${name}_${index}`));

  db.exec(`create table aegis_archetypes (${unique.map((name) => `"${name}" text`).join(", ")})`);

  const insert = db.prepare(
    `insert into aegis_archetypes (${unique.map((name) => `"${name}"`).join(", ")}) `
    + `values (${unique.map(() => "?").join(", ")})`,
  );

  let count = 0;
  for (const row of rows.slice(1)) {
    const values = unique.map((_, index) => (row[index] ?? "").trim());
    if (!values[2]) continue;
    insert.run(...values);
    count++;
  }
  return count;
}

function buildAegis(db, tabs) {
  const insert = db.prepare(`insert into aegis_weapons
    (tab, name, season, energy, frame, source, ammo, barrel, magazine, masterwork, perk1, perk2, origin_trait, notes, tier)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  for (const [tab, rows] of tabs) {
    if (tab === "Archetypes") continue;
    if (rows.length === 0) continue;
    const header = rows[0].map((h) => h.trim());
    const column = (names) => header.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)));

    const index = {
      name: column(["name"]),
      season: column(["season"]),
      energy: column(["energy"]),
      frame: column(["frame"]),
      source: column(["source"]),
      ammo: column(["ammo"]),
      barrel: column(["barrel"]),
      magazine: column(["mag"]),
      masterwork: column(["mw", "masterwork"]),
      perk1: column(["perk 1", "perk1"]),
      perk2: column(["perk 2", "perk2"]),
      origin: column(["origin"]),
      notes: column(["notes", "analysis"]),
      tier: column(["tier"]),
    };

    for (const row of rows.slice(1)) {
      const pick = (key) => (index[key] >= 0 ? (row[index[key]] ?? "").trim() : "");
      const name = pick("name");
      if (!name) continue;
      insert.run(
        tab,
        name,
        pick("season"),
        pick("energy"),
        pick("frame"),
        pick("source"),
        pick("ammo"),
        pick("barrel"),
        pick("magazine"),
        pick("masterwork"),
        pick("perk1"),
        pick("perk2"),
        pick("origin"),
        pick("notes"),
        pick("tier"),
      );
      count++;
    }
  }
  return count;
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), "d2-spike-"));
  const manifest = await getJson(`${BUNGIE}/Platform/Destiny2/Manifest/`);
  const worldPath = manifest.Response.mobileWorldContentPaths.en;
  const version = manifest.Response.version;
  console.log(`manifest version ${version}`);

  const zip = await download(`${BUNGIE}${worldPath}`);
  const manifestSqlitePath = join(workDir, "world.sqlite");
  writeFileSync(manifestSqlitePath, extractSingleZipFile(zip));
  console.log(`world content ${(zip.length / 1e6).toFixed(0)}MB downloaded`);

  rmSync(DB_PATH, { force: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    create table weapons (hash text primary key, name text, type text, tier text,
      damage_type text, frame text, ammo_type text, stats text, perks text);
    create table aegis_weapons (tab text, name text, season text, energy text, frame text,
      source text, ammo text, barrel text, magazine text, masterwork text, perk1 text,
      perk2 text, origin_trait text, notes text, tier text);
    create table armor (name text, slot text, class text, tier text, stats text, perks text,
      description text);
    create table subclass_plugs (name text, kind text, class text, element text,
      description text);
    create table activities (name text, type text, place text, destination text,
      light_level integer, is_pvp integer, variants integer);
    create table meta (key text primary key, value text);
  `);

  const manifestDb = new DatabaseSync(manifestSqlitePath, { readOnly: true });
  const counts = buildManifestTables(db, manifestDb);
  manifestDb.close();
  rmSync(workDir, { recursive: true, force: true });

  db.prepare("insert into meta values (?, ?)").run("manifest_version", version);
  db.prepare("insert into meta values (?, ?)").run("synced_at", new Date().toISOString());

  console.log(`weapons ${counts.weapons}`);
  console.log(`armor ${counts.armor}`);
  console.log(`subclass_plugs ${counts.subclassPlugs}`);
  console.log(`activities ${counts.activities}`);

  const tabs = [];
  for (const tab of AEGIS_TABS) {
    const rows = await fetchAegisTab(tab);
    tabs.push([tab, rows]);
    console.log(`aegis ${tab}: ${rows.length - 1} rows`);
  }
  console.log(`aegis_weapons ${buildAegis(db, tabs)}`);
  console.log(`aegis_archetypes ${buildAegisArchetypes(db, tabs.find(([tab]) => tab === "Archetypes")[1])}`);

  db.exec("create index weapons_name on weapons(name); create index aegis_name on aegis_weapons(name);");
  db.close();
  console.log(`wrote ${DB_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
