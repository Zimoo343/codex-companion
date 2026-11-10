// Refresh the live cache. Run by a schedule, not by user requests.
import { getRotation, getXur } from "./bungie.ts";

const rotation = await getRotation();
console.log(
  rotation
    ? `rotation: ${rotation.names.length} milestones, fetched ${rotation.fetchedAt.toISOString()}`
    : "rotation: unavailable",
);

const xur = await getXur();
console.log(
  xur
    ? `xur: ${xur.present ? `${xur.items.length} items` : "not in town"}, next refresh ${xur.nextRefresh}`
    : "xur: unavailable",
);
