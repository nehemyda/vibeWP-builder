/**
 * Raw-SQL migration: a title on each media asset.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch28.ts
 *
 * WHY BESIDE alt AND NOT INSTEAD OF IT
 *
 * They answer different questions. alt is what replaces the picture for
 * someone who cannot see it; the title is extra, shown on hover, and some
 * screen readers announce it IN ADDITION — so a title that repeats the alt is
 * the same sentence read twice.
 *
 * A placed picture keeps both on the page, where core's own image block
 * carries them. This column is for a file that is in the library and not yet
 * used, so what the client typed travels with it when it is placed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS title text`;
  console.log("media_assets.title ready");
  await sql.end();
}

main();
