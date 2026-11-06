import { DatabaseSync } from "node:sqlite";
import { inflateRawSync } from "node:zlib";
import {
  collapseActivities,
  dedupeWeapons,
  stripHtml,
  type ActivityRow,
  type ArmorRow,
  type SubclassPlugRow,
  type WeaponRow,
} from "./normalise.ts";

const BUNGIE = "https://www.bungie.net";

const AMMO_NAMES: Record<number, string> = { 1: "Primary", 2: "Special", 3: "Heavy" };
const CLASS_NAMES: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock", 3: "Any" };

type ManifestItem = {
  hash: number;
  itemType?: number;
  displayProperties?: { name?: string; description?: string };
  itemTypeDisplayName?: string;
  inventory?: { tierTypeName?: string };
  defaultDamageType?: number;
  equippingBlock?: { ammoType?: number };
  investmentStats?: Array<{ statTypeHash: number; value: number }>;
  sockets?: { socketEntries?: Array<{ singleInitialItemHash: number }> };
  perks?: Array<{ perkHash: number }>;
  plug?: { plugCategoryIdentifier?: string };
  classType?: number;
};

type ManifestActivity = {
  displayProperties?: { name?: string };
  activityTypeHash?: number;
  placeHash?: number;
  destinationHash?: number;
  activityLightLevel?: number;
  isPvP?: boolean;
  redacted?: boolean;
  blacklisted?: boolean;
};

export type ManifestBundle = {
  version: string;
  weapons: WeaponRow[];
  armor: ArmorRow[];
  plugs: SubclassPlugRow[];
  activities: ActivityRow[];
};

export async function fetchManifest(): Promise<{ version: string; zip: Buffer }> {
  const response = await fetch(`${BUNGIE}/Platform/Destiny2/Manifest/`);
  if (!response.ok) throw new Error(`manifest request failed: ${response.status}`);

  const body = (await response.json()) as {
    Response: { version: string; mobileWorldContentPaths: Record<string, string> };
  };

  const archive = await fetch(`${BUNGIE}${body.Response.mobileWorldContentPaths.en}`);
  if (!archive.ok) throw new Error(`world content download failed: ${archive.status}`);

  return { version: body.Response.version, zip: Buffer.from(await archive.arrayBuffer()) };
}

// The world content ships as a single-entry zip, not as a bare SQLite file.
export function extractZipEntry(zip: Buffer): Buffer {
  if (zip.readUInt32LE(0) !== 0x04034b50) throw new Error("world content is not a zip file");

  const method = zip.readUInt16LE(8);
  const compressedSize = zip.readUInt32LE(18);
  if (compressedSize === 0) throw new Error("zip entry uses a data descriptor, unsupported");

  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  const body = zip.subarray(start, start + compressedSize);

  return method === 0 ? body : inflateRawSync(body);
}

function readAll<T>(db: DatabaseSync, table: string): T[] {
  return db
    .prepare(`select json from ${table}`)
    .all()
    .map((row) => JSON.parse(String(row.json)) as T);
}

export function buildManifestBundle(manifestDb: DatabaseSync, version: string): ManifestBundle {
  const items = readAll<ManifestItem>(manifestDb, "DestinyInventoryItemDefinition");
  const itemsByHash = new Map(items.map((item) => [item.hash, item]));

  const statNames = new Map<number, string>();
  for (const stat of readAll<{ hash: number; displayProperties?: { name?: string } }>(
    manifestDb,
    "DestinyStatDefinition",
  )) {
    statNames.set(stat.hash, stat.displayProperties?.name ?? String(stat.hash));
  }

  const damageNames = new Map<number, string>();
  for (const damage of readAll<{ enumValue: number; displayProperties?: { name?: string } }>(
    manifestDb,
    "DestinyDamageTypeDefinition",
  )) {
    damageNames.set(damage.enumValue, damage.displayProperties?.name ?? "");
  }

  const perkDescriptions = new Map<number, string>();
  for (const perk of readAll<{ hash: number; displayProperties?: { description?: string } }>(
    manifestDb,
    "DestinySandboxPerkDefinition",
  )) {
    if (perk.displayProperties?.description)
      perkDescriptions.set(perk.hash, stripHtml(perk.displayProperties.description));
  }

  const weaponPerkDescriptions = new Map<number, string>();
  for (const perk of readAll<{ hash: number; displayProperties?: { description?: string } }>(
    manifestDb,
    "DestinySandboxPerkDefinition",
  )) {
    const description = stripHtml(perk.displayProperties?.description);
    if (description) weaponPerkDescriptions.set(perk.hash, description);
  }

  const weapons: WeaponRow[] = [];
  for (const item of items) {
    if (item.itemType !== 3) continue;
    const name = item.displayProperties?.name;
    if (!name) continue;

    const stats: Record<string, number> = {};
    for (const stat of item.investmentStats ?? []) {
      const statName = statNames.get(stat.statTypeHash);
      if (statName) stats[statName] = stat.value;
    }

    const perks = new Set<string>();
    for (const socket of item.sockets?.socketEntries ?? []) {
      const plugName = itemsByHash.get(socket.singleInitialItemHash)?.displayProperties?.name;
      if (plugName) perks.add(plugName);
    }

    weapons.push({
      hash: String(item.hash),
      name,
      type: item.itemTypeDisplayName ?? "",
      tier: item.inventory?.tierTypeName ?? "",
      damageType: damageNames.get(item.defaultDamageType ?? -1) ?? "",
      frame: item.itemTypeDisplayName ?? "",
      ammoType: AMMO_NAMES[item.equippingBlock?.ammoType ?? 0] ?? "",
      stats,
      perks: [...perks],
    });
  }

  const armor: ArmorRow[] = [];
  const seenArmor = new Set<string>();
  for (const item of items) {
    if (item.itemType !== 2) continue;
    if (item.inventory?.tierTypeName !== "Exotic") continue;
    const name = item.displayProperties?.name;
    if (!name || seenArmor.has(name)) continue;
    seenArmor.add(name);

    const stats: Record<string, number> = {};
    for (const stat of item.investmentStats ?? []) {
      const statName = statNames.get(stat.statTypeHash);
      if (statName) stats[statName] = stat.value;
    }

    // The exotic effect lives on the sandbox perk; socket entries also carry mods
    // and masterwork text, which is noise for answering "what does this do".
    const perks: string[] = [];
    for (const perk of item.perks ?? []) {
      const description = weaponPerkDescriptions.get(perk.perkHash);
      if (description) perks.push(description);
    }
    for (const socket of item.sockets?.socketEntries ?? []) {
      const description = stripHtml(
        itemsByHash.get(socket.singleInitialItemHash)?.displayProperties?.description,
      );
      if (description) perks.push(description);
    }

    const effectText = perks.filter(
      (perk) =>
        !/^(no mod|restores your (gear|armor)|upgrade this armor|fully upgrading|increased (resilience|mobility|recovery|intellect|discipline|strength))/i.test(
          perk,
        ),
    );

    armor.push({
      name,
      slot: item.itemTypeDisplayName ?? "",
      class: CLASS_NAMES[item.classType ?? -1] ?? "",
      tier: item.inventory?.tierTypeName ?? "",
      stats,
      perks: effectText.slice(0, 3),
      description: stripHtml(item.displayProperties?.description) || effectText[0] || "",
    });
  }

  const plugs: SubclassPlugRow[] = [];
  const seenPlugs = new Set<string>();
  for (const item of items) {
    if (item.itemType !== 19) continue;

    const category = item.plug?.plugCategoryIdentifier ?? "";
    const isAspect = category.endsWith(".aspects");
    const isFragment = category.endsWith(".fragments");
    const isArtifact = item.itemTypeDisplayName === "Artifact Perk";
    if (!isAspect && !isFragment && !isArtifact) continue;

    const name = item.displayProperties?.name;
    if (!name || /^Empty .* Socket$/.test(name) || seenPlugs.has(name)) continue;

    const ownDescription = stripHtml(item.displayProperties?.description);
    const perkDescription = (item.perks ?? [])
      .map((perk) => perkDescriptions.get(perk.perkHash))
      .filter(Boolean)
      .join(" ");
    const description = ownDescription || perkDescription;
    if (!description) continue;
    seenPlugs.add(name);

    const kind = isArtifact ? "artifact perk" : isAspect ? "aspect" : "fragment";
    const [owner, element] = isAspect || isFragment ? category.split(".") : ["shared", ""];

    plugs.push({ name, kind, class: owner ?? "shared", element: element ?? "", description });
  }

  const typeNames = new Map<number, string>();
  for (const type of readAll<{ hash: number; displayProperties?: { name?: string } }>(
    manifestDb,
    "DestinyActivityTypeDefinition",
  )) {
    typeNames.set(type.hash, type.displayProperties?.name ?? "");
  }
  const placeNames = new Map<number, string>();
  for (const place of readAll<{ hash: number; displayProperties?: { name?: string } }>(
    manifestDb,
    "DestinyPlaceDefinition",
  )) {
    placeNames.set(place.hash, place.displayProperties?.name ?? "");
  }
  const destinationNames = new Map<number, string>();
  for (const destination of readAll<{ hash: number; displayProperties?: { name?: string } }>(
    manifestDb,
    "DestinyDestinationDefinition",
  )) {
    destinationNames.set(destination.hash, destination.displayProperties?.name ?? "");
  }

  const rawActivities = [];
  for (const activity of readAll<ManifestActivity>(manifestDb, "DestinyActivityDefinition")) {
    const name = activity.displayProperties?.name;
    if (!name || activity.redacted || activity.blacklisted || activity.isPvP) continue;

    rawActivities.push({
      name,
      type: typeNames.get(activity.activityTypeHash ?? -1) ?? "",
      place: placeNames.get(activity.placeHash ?? -1) ?? "",
      destination: destinationNames.get(activity.destinationHash ?? -1) ?? "",
      lightLevel: activity.activityLightLevel ?? 0,
      isPvp: false,
    });
  }

  return {
    version,
    weapons: dedupeWeapons(weapons),
    armor,
    plugs,
    activities: collapseActivities(rawActivities),
  };
}
