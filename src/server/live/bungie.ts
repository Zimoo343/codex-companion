// Live Bungie data: cached, never fetched per user request.
import { createDatabase } from "../db/client.ts";

const BUNGIE = "https://www.bungie.net";
const MINUTE = 60_000;

export type CachedValue<T> = { value: T; fetchedAt: Date };

type CacheRow = { payload: unknown; fetched_at: Date };

async function readCache<T>(endpoint: string): Promise<CachedValue<T> | null> {
  const { pool } = createDatabase();
  try {
    const result = await pool.query<CacheRow>(
      `select payload, fetched_at from live_cache
        where endpoint = $1 and expires_at > now()`,
      [endpoint],
    );
    const row = result.rows[0];
    return row ? { value: row.payload as T, fetchedAt: new Date(row.fetched_at) } : null;
  } finally {
    await pool.end();
  }
}

async function writeCache(endpoint: string, payload: unknown, ttlMs: number): Promise<void> {
  const { pool } = createDatabase();
  try {
    await pool.query(
      `insert into live_cache (endpoint, payload, fetched_at, expires_at)
       values ($1, $2::jsonb, now(), now() + ($3 || ' milliseconds')::interval)
       on conflict (endpoint) do update
         set payload = excluded.payload,
             fetched_at = excluded.fetched_at,
             expires_at = excluded.expires_at`,
      [endpoint, JSON.stringify(payload), String(ttlMs)],
    );
  } finally {
    await pool.end();
  }
}

async function bungie<T>(path: string, ttlMs: number): Promise<CachedValue<T> | null> {
  const cached = await readCache<T>(path);
  if (cached) return cached;

  const key = process.env.BUNGIE_API_KEY;
  if (!key) throw new Error("BUNGIE_API_KEY is not set");

  const response = await fetch(`${BUNGIE}${path}`, { headers: { "X-API-Key": key } });
  if (!response.ok) {
    console.error(`bungie ${path} -> ${response.status}`);
    return null;
  }

  const body = (await response.json()) as { Response?: T };
  if (!body.Response) return null;

  await writeCache(path, body.Response, ttlMs);
  return { value: body.Response, fetchedAt: new Date() };
}

type MilestoneEntry = { order?: number; activities?: Array<{ activityHash: number }> };

// Weekly content. Destination milestones sit in a low order band, weekly ones above 3000.
export async function getRotation(): Promise<{ names: string[]; fetchedAt: Date } | null> {
  const payload = await bungie<Record<string, MilestoneEntry>>(
    "/Platform/Destiny2/Milestones/",
    30 * MINUTE,
  );
  if (!payload) return null;

  const weekly = Object.entries(payload.value)
    .filter(([, milestone]) => (milestone.order ?? 0) >= 3000)
    .map(([hash]) => hash);

  if (weekly.length === 0) return { names: [], fetchedAt: payload.fetchedAt };

  const { pool } = createDatabase();
  try {
    const result = await pool.query<{ name: string }>(
      `select name from milestones where hash = any($1::text[]) order by name`,
      [weekly],
    );
    const names = result.rows
      .map((row) => row.name)
      .filter((name) => !/engrams?|clan|destination/i.test(name));
    return { names, fetchedAt: payload.fetchedAt };
  } finally {
    await pool.end();
  }
}

type VendorEntry = {
  vendorHash: number;
  nextRefreshDate: string;
  saleItems?: Record<string, { itemHash: number }>;
};

type VendorsResponse = {
  vendors?: { data?: Record<string, VendorEntry> };
  vendorGroups?: { data?: { groups?: Array<{ vendorGroupHash: number; vendorHashes: number[] }> } };
};

const LIMITED_TIME_GROUP = "3227191227";

// Xur lives in the Limited Time vendor group. Outside his window the endpoint still
// returns him, with no sale items.
export async function getXur(): Promise<{
  present: boolean;
  items: string[];
  nextRefresh: string;
  fetchedAt: Date;
} | null> {
  const payload = await bungie<VendorsResponse>(
    "/Platform/Destiny2/Vendors/?components=400,401",
    15 * MINUTE,
  );
  if (!payload) return null;

  const groups = payload.value.vendorGroups?.data?.groups ?? [];
  const limited = groups.find((group) => String(group.vendorGroupHash) === LIMITED_TIME_GROUP);
  const vendorHashes = new Set((limited?.vendorHashes ?? []).map(String));

  const vendors = payload.value.vendors?.data ?? {};
  const vendor = Object.entries(vendors).find(([hash]) => vendorHashes.has(hash))?.[1];
  if (!vendor) {
    return { present: false, items: [], nextRefresh: "", fetchedAt: payload.fetchedAt };
  }

  const itemHashes = Object.values(vendor.saleItems ?? {}).map((sale) => String(sale.itemHash));
  if (itemHashes.length === 0) {
    return {
      present: false,
      items: [],
      nextRefresh: vendor.nextRefreshDate,
      fetchedAt: payload.fetchedAt,
    };
  }

  const { pool } = createDatabase();
  try {
    const result = await pool.query<{ name: string }>(
      `select name from weapons where hash = any($1::text[])
       union all
       select name from armor where name is not null and false`,
      [itemHashes],
    );
    return {
      present: true,
      items: result.rows.map((row) => row.name),
      nextRefresh: vendor.nextRefreshDate,
      fetchedAt: payload.fetchedAt,
    };
  } finally {
    await pool.end();
  }
}
