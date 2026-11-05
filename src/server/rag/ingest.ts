import { ingestAnnouncements } from "./ingest-announcements.ts";
import { ingestWiki } from "./ingest-wiki.ts";

const target = process.argv[2] ?? "announcements";
const dryRun = process.argv.includes("--dry-run");
const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag > 0 ? Number(process.argv[limitFlag + 1]) : undefined;

if (target === "announcements") {
  const result = await ingestAnnouncements({ dryRun });
  console.log(
    `documents ${result.documents}, chunks ${result.chunks}, ` +
      `embedded ${result.embedded}, skipped ${result.skipped}`,
  );
} else if (target === "wiki") {
  const result = await ingestWiki({ dryRun, limit });
  console.log(
    `pages ${result.pages}, missing ${result.missing}, chunks ${result.chunks}, ` +
      `embedded ${result.embedded}, skipped ${result.skipped}`,
  );
} else {
  throw new Error(`unknown ingest target: ${target}`);
}
