/**
 * Raw-SQL migration: record which site a clone was started from.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch39.ts
 *
 * Lineage, not a dependency. Nothing reads this at render time and a clone is
 * a complete site the moment it exists — it borrows a structure, not a parent.
 *
 * It is here for the question that cannot be answered later: when a site used
 * as a template turns out to carry a bad section or a wrong claim, which sites
 * inherited it? Without the column the answer is to open every site and look,
 * and the answer is needed on exactly the day nobody has time to.
 *
 * Deliberately NO foreign key and no cascade. Deleting a source must not
 * touch, or refuse to delete because of, the sites built from it — the
 * relationship is historical and the child does not depend on the parent
 * existing.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS cloned_from_site_id uuid`;

  /* Answering "what came from this template" is the whole point, so the index
     is on the column being searched rather than left to a sequential scan. */
  await sql`CREATE INDEX IF NOT EXISTS sites_cloned_from_idx ON sites (cloned_from_site_id)`;

  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM sites WHERE cloned_from_site_id IS NOT NULL`;
  console.log(`sites.cloned_from_site_id present — ${n} site(s) recorded as clones`);

  await sql.end();
  process.exit(0);
}
void main();
