// Builds the tables that come from the Bungie manifest SQLite file.

const stripHtml = (text) => (text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function readAll(manifestDb, table) {
  return manifestDb.prepare(`select json from ${table}`).all().map((row) => JSON.parse(row.json));
}

export function buildWeapons(db, manifestDb) {
  const statNames = new Map();
  for (const stat of readAll(manifestDb, "DestinyStatDefinition")) {
    statNames.set(stat.hash, stat.displayProperties?.name ?? String(stat.hash));
  }

  const damageNames = new Map();
  for (const damage of readAll(manifestDb, "DestinyDamageTypeDefinition")) {
    damageNames.set(damage.enumValue, damage.displayProperties?.name ?? "");
  }

  const ammoNames = { 1: "Primary", 2: "Special", 3: "Heavy" };

  const items = readAll(manifestDb, "DestinyInventoryItemDefinition");
  const itemsByHash = new Map(items.map((item) => [item.hash, item]));

  const insert = db.prepare(`insert into weapons
    (hash, name, type, tier, damage_type, frame, ammo_type, stats, perks)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const item of items) {
    if (item.itemType !== 3) continue;
    if (!item.displayProperties?.name) continue;

    const stats = {};
    for (const stat of item.investmentStats ?? []) {
      const name = statNames.get(stat.statTypeHash);
      if (name) stats[name] = stat.value;
    }

    const perks = new Set();
    for (const socket of item.sockets?.socketEntries ?? []) {
      const plugName = itemsByHash.get(socket.singleInitialItemHash)?.displayProperties?.name;
      if (plugName) perks.add(plugName);
    }

    insert.run(
      String(item.hash),
      item.displayProperties.name,
      item.itemTypeDisplayName ?? "",
      item.inventory?.tierTypeName ?? "",
      damageNames.get(item.defaultDamageType) ?? "",
      item.itemTypeDisplayName ?? "",
      ammoNames[item.equippingBlock?.ammoType] ?? "",
      JSON.stringify(stats),
      JSON.stringify([...perks]),
    );
  }

  // Reissued weapons repeat under the same name with slightly different plugs.
  // Keep the row with the most plugs and treat it as the current definition.
  db.exec(`delete from weapons where hash not in (
    select hash from weapons w1 where not exists (
      select 1 from weapons w2
      where w2.name = w1.name and length(w2.perks) > length(w1.perks)
    )
  )`);

  return db.prepare("select count(*) c from weapons").get().c;
}

export function buildArmor(db, manifestDb) {
  const statNames = new Map();
  for (const stat of readAll(manifestDb, "DestinyStatDefinition")) {
    statNames.set(stat.hash, stat.displayProperties?.name ?? String(stat.hash));
  }
  const classNames = { 0: "Titan", 1: "Hunter", 2: "Warlock", 3: "Any" };

  const items = readAll(manifestDb, "DestinyInventoryItemDefinition");
  const itemsByHash = new Map(items.map((item) => [item.hash, item]));

  const insert = db.prepare(`insert into armor
    (name, slot, class, tier, stats, perks, description)
    values (?, ?, ?, ?, ?, ?, ?)`);

  const seen = new Set();
  for (const item of items) {
    if (item.itemType !== 2) continue;
    if (item.inventory?.tierTypeName !== "Exotic") continue;
    const name = item.displayProperties?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const stats = {};
    for (const stat of item.investmentStats ?? []) {
      const statName = statNames.get(stat.statTypeHash);
      if (statName) stats[statName] = stat.value;
    }

    const perks = [];
    for (const socket of item.sockets?.socketEntries ?? []) {
      const plug = itemsByHash.get(socket.singleInitialItemHash);
      const description = stripHtml(plug?.displayProperties?.description);
      if (description) perks.push(description);
    }

    insert.run(
      name,
      item.itemTypeDisplayName ?? "",
      classNames[item.classType] ?? "",
      item.inventory?.tierTypeName ?? "",
      JSON.stringify(stats),
      JSON.stringify(perks.slice(0, 6)),
      stripHtml(item.displayProperties?.description),
    );
  }

  return db.prepare("select count(*) c from armor").get().c;
}

// Aspects, fragments, abilities and artifact perks are all mods (itemType 19).
// The plug category name carries class, element and kind, e.g. "hunter.void.aspects".
// Most of them carry no description of their own; the text lives on the sandbox perk.
export function buildSubclassPlugs(db, manifestDb) {
  const insert = db.prepare(`insert into subclass_plugs
    (name, kind, class, element, description) values (?, ?, ?, ?, ?)`);

  const perkDescriptions = new Map();
  for (const perk of readAll(manifestDb, "DestinySandboxPerkDefinition")) {
    if (perk.displayProperties?.description) perkDescriptions.set(perk.hash, stripHtml(perk.displayProperties.description));
  }

  const seen = new Set();
  for (const item of readAll(manifestDb, "DestinyInventoryItemDefinition")) {
    if (item.itemType !== 19) continue;
    const category = item.plug?.plugCategoryIdentifier ?? "";
    const isAspect = category.endsWith(".aspects");
    const isFragment = category.endsWith(".fragments");
    const isArtifact = item.itemTypeDisplayName === "Artifact Perk";
    if (!isAspect && !isFragment && !isArtifact) continue;

    const name = item.displayProperties?.name;
    if (!name || /^Empty .* Socket$/.test(name) || seen.has(name)) continue;

    const ownDescription = stripHtml(item.displayProperties?.description);
    const perkDescription = (item.perks ?? [])
      .map((perk) => perkDescriptions.get(perk.perkHash))
      .filter(Boolean)
      .join(" ");
    const description = ownDescription || perkDescription;
    if (!description) continue;
    seen.add(name);

    const kind = isArtifact ? "artifact perk" : isAspect ? "aspect" : "fragment";
    let owner = "shared";
    let element = "";
    if (isAspect || isFragment) {
      const [ownerPart, elementPart] = category.split(".");
      owner = ownerPart;
      element = elementPart ?? "";
    }

    insert.run(name, kind, owner, element, description);
  }

  return db.prepare("select count(*) c from subclass_plugs").get().c;
}

export function buildActivities(db, manifestDb) {
  const typeNames = new Map(readAll(manifestDb, "DestinyActivityTypeDefinition").map((type) => [type.hash, type.displayProperties?.name]));
  const placeNames = new Map(readAll(manifestDb, "DestinyPlaceDefinition").map((place) => [place.hash, place.displayProperties?.name]));
  const destinationNames = new Map(readAll(manifestDb, "DestinyDestinationDefinition").map((destination) => [destination.hash, destination.displayProperties?.name]));

  // The manifest keeps one row per difficulty and legacy version, so collapse
  // "Duality: Standard", "Duality: Master" and so on to a single activity.
  const normalize = (name) => name.split(":")[0].replace(/\s+/g, " ").trim();

  // Only PvE content people actually ask about. Story steps, private matches
  // and seasonal filler would drown the table.
  const allowedTypes = new Set([
    "Raid", "Dungeon", "Strike", "Nightfall", "Vanguard Op", "Exotic Mission",
    "Lost Sector", "Onslaught", "Seasonal Arena", "Nightmare Hunt", "Empire Hunt",
  ]);

  const activities = new Map();
  for (const activity of readAll(manifestDb, "DestinyActivityDefinition")) {
    const rawName = activity.displayProperties?.name;
    if (!rawName || activity.redacted || activity.blacklisted) continue;
    if (activity.isPvP) continue;

    const type = typeNames.get(activity.activityTypeHash) ?? "";
    if (!allowedTypes.has(type)) continue;

    const name = normalize(rawName);
    if (!name || name.startsWith("Featured")) continue;

    const key = `${type}|${name}`;
    const existing = activities.get(key);
    if (existing) {
      existing.variants += 1;
      continue;
    }

    activities.set(key, {
      name,
      type,
      place: placeNames.get(activity.placeHash) ?? "",
      destination: destinationNames.get(activity.destinationHash) ?? "",
      light_level: activity.activityLightLevel ?? 0,
      is_pvp: activity.isPvP ? 1 : 0,
      variants: 1,
    });
  }

  const insert = db.prepare(`insert into activities
    (name, type, place, destination, light_level, is_pvp, variants)
    values (?, ?, ?, ?, ?, ?, ?)`);

  for (const activity of activities.values()) {
    insert.run(activity.name, activity.type, activity.place, activity.destination, activity.light_level, activity.is_pvp, activity.variants);
  }

  return activities.size;
}

export function buildManifestTables(db, manifestDb) {
  return {
    weapons: buildWeapons(db, manifestDb),
    armor: buildArmor(db, manifestDb),
    subclassPlugs: buildSubclassPlugs(db, manifestDb),
    activities: buildActivities(db, manifestDb),
  };
}

