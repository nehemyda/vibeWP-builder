/**
 * Raw-SQL migration: per-page meta tags.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch27.ts
 *
 * WHY ON THE PAGE AND NOT IN A SETTINGS BLOB
 *
 * A meta description is a fact about one page, and it has to survive that
 * page being renamed, reordered or re-exported. A site-level jsonb keyed by
 * slug would break the moment a slug changed, which is a thing clients do.
 *
 * WHY NULL AND NOT AN EMPTY STRING
 *
 * Null means "nobody has written one", empty means "someone cleared it". The
 * generator needs that difference: "missing only" must not overwrite a
 * description a client deliberately emptied, and cannot tell which is which
 * from "".
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS meta_title text`;
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS meta_description text`;
  /*
   * Kept out of search results. Defaults false rather than null: "should this
   * page be indexed" always has an answer, and the answer is yes.
   */
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS no_index boolean NOT NULL DEFAULT false`;
  /*
   * Which of these the model wrote, so the table can say so and a regenerate
   * can leave a client's own words alone.
   */
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS meta_generated_at timestamptz`;

  console.log("site_pages: meta columns ready");
  await sql.end();
}

main();
