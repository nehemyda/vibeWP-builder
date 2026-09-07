/**
 * Raw-SQL migration: focus keyword and canonical URL per page.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch29.ts
 *
 * WHY A FOCUS KEYWORD IS STORED AND NOT DERIVED
 *
 * It is an intention, not a fact about the page. Two people can look at the
 * same services page and reasonably target "emergency plumber bath" or "boiler
 * repair bath", and which one they chose has to survive the next regeneration
 * — otherwise the title and description drift to whatever the model felt like
 * this time.
 *
 * WHY CANONICAL IS NULLABLE AND MEANS "WORDPRESS DECIDES"
 *
 * WordPress emits its own canonical for every page, and it is right almost
 * always. A stored value is an override for the cases it cannot know about —
 * the same content published elsewhere, a campaign URL with parameters — so
 * absent must mean "leave core alone" rather than "there isn't one".
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS focus_keyword text`;
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS canonical_url text`;
  console.log("site_pages: focus_keyword, canonical_url ready");
  await sql.end();
}

main();
