import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  primaryKey,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  url: text("url").notNull(),
  credit: text("credit").notNull().default(""),
  licenseNote: text("license_note").notNull().default(""),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", { length: 40 }).notNull(),
    version: text("version").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull(),
    detail: jsonb("detail").$type<Record<string, number | string>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("sync_runs_kind_started").on(table.kind, table.startedAt)],
);

export const weapons = pgTable(
  "weapons",
  {
    hash: varchar("hash", { length: 20 }).primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull().default(""),
    tier: text("tier").notNull().default(""),
    damageType: text("damage_type").notNull().default(""),
    frame: text("frame").notNull().default(""),
    ammoType: text("ammo_type").notNull().default(""),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    perks: jsonb("perks").$type<string[]>().notNull().default([]),
  },
  (table) => [index("weapons_name_idx").on(table.name)],
);

export const armor = pgTable(
  "armor",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    slot: text("slot").notNull().default(""),
    class: text("class").notNull().default(""),
    tier: text("tier").notNull().default(""),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    perks: jsonb("perks").$type<string[]>().notNull().default([]),
    description: text("description").notNull().default(""),
  },
  (table) => [index("armor_class_idx").on(table.class)],
);

export const subclassPlugs = pgTable(
  "subclass_plugs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    class: text("class").notNull().default("shared"),
    element: text("element").notNull().default(""),
    description: text("description").notNull(),
  },
  (table) => [
    unique("subclass_plugs_name_kind").on(table.name, table.kind),
    index("subclass_plugs_kind_idx").on(table.kind),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    place: text("place").notNull().default(""),
    destination: text("destination").notNull().default(""),
    lightLevel: integer("light_level").notNull().default(0),
    isPvp: boolean("is_pvp").notNull().default(false),
    variants: integer("variants").notNull().default(1),
  },
  (table) => [
    unique("activities_type_name").on(table.type, table.name),
    index("activities_type_idx").on(table.type),
  ],
);

export const aegisWeapons = pgTable(
  "aegis_weapons",
  {
    id: serial("id").primaryKey(),
    tab: text("tab").notNull(),
    name: text("name").notNull(),
    season: text("season").notNull().default(""),
    energy: text("energy").notNull().default(""),
    frame: text("frame").notNull().default(""),
    source: text("source").notNull().default(""),
    ammo: text("ammo").notNull().default(""),
    barrel: text("barrel").notNull().default(""),
    magazine: text("magazine").notNull().default(""),
    masterwork: text("masterwork").notNull().default(""),
    perk1: text("perk1").notNull().default(""),
    perk2: text("perk2").notNull().default(""),
    originTrait: text("origin_trait").notNull().default(""),
    notes: text("notes").notNull().default(""),
    tier: text("tier").notNull().default(""),
  },
  (table) => [
    unique("aegis_weapons_tab_name").on(table.tab, table.name),
    index("aegis_weapons_name_idx").on(table.name),
  ],
);

// The sheet's column set is wide and changes upstream, so the whole row is kept
// as json under the sheet's own headers. The handful of columns people filter on
// are extracted for indexing.
export const aegisArchetypes = pgTable(
  "aegis_archetypes",
  {
    id: serial("id").primaryKey(),
    weapon: text("weapon").notNull(),
    frame: text("frame").notNull().default(""),
    ammo: text("ammo").notNull().default(""),
    tier: text("tier").notNull().default(""),
    oneMagBdps: integer("one_mag_bdps"),
    typicalBdps: integer("typical_bdps"),
    maxBdps: integer("max_bdps"),
    row: jsonb("row").$type<Record<string, string>>().notNull(),
  },
  (table) => [
    index("aegis_archetypes_weapon_frame_idx").on(table.weapon, table.frame),
    index("aegis_archetypes_tier_idx").on(table.tier),
  ],
);

// Community sheets that are many small tables stacked per tab: perks, mechanics,
// boss damage. Stored as rows keyed by the sheet's own headers.
export const sheetRows = pgTable(
  "sheet_rows",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 120 }).notNull(),
    tab: text("tab").notNull(),
    section: text("section").notNull().default(""),
    row: jsonb("row").$type<Record<string, string>>().notNull(),
  },
  (table) => [index("sheet_rows_source_tab_idx").on(table.source, table.tab)],
);

export const externalTools = pgTable("external_tools", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  url: text("url").notNull(),
  answers: text("answers").notNull(),
  recommendWhen: text("recommend_when").notNull(),
  lastReviewed: varchar("last_reviewed", { length: 10 }).notNull().default(""),
});

export const guides = pgTable(
  "guides",
  {
    id: serial("id").primaryKey(),
    sourceName: varchar("source_name", { length: 120 }).notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    section: text("section").notNull().default(""),
    licenseNote: text("license_note").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    contentHash: varchar("content_hash", { length: 64 }).notNull().unique(),
    content: text("content").notNull(),
    era: varchar("era", { length: 10 }).notNull().default("unknown"),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("guides_source_idx").on(table.sourceName),
    index("guides_published_idx").on(table.publishedAt),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    ip: varchar("ip", { length: 64 }).notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.ip, table.day] })],
);

export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  note: text("note").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vectorExtension = sql`create extension if not exists vector`;
