/**
 * Raw-SQL migration adding history for the header and footer.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch20.ts
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY CHROME NEEDED ITS OWN TABLE
 *
 * page_revisions.page_id is NOT NULL and references site_pages, because until
 * now every reversible change belonged to a page. The header and footer belong
 * to the SITE — they are template parts shared by every page — so they have no
 * page to hang a revision from.
 *
 * The consequence was not a missing feature but a lying one. Undo restored a
 * page revision and reported "Stepped back one version" while leaving a swapped
 * header exactly where it was, so a client who disliked an AI change to their
 * header was told it had been reverted and could see that it had not.
 *
 * Both columns are snapshotted together in one row rather than separately.
 * Header and footer are usually written in the same breath, and a client
 * undoing "make my site look different" means both — two independent stacks
 * would let them drift into a combination that never existed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS site_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id),
      header_schema_json jsonb,
      footer_schema_json jsonb,
      kind text NOT NULL,
      reason text,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  /*
   * Stepping reads the newest row for one site and one direction, and
   * compares its age against the page stack's newest, so those three columns
   * are what every query filters and orders on.
   */
  await sql`
    CREATE INDEX IF NOT EXISTS site_revisions_site_kind_created_idx
      ON site_revisions (site_id, kind, created_at DESC)`;

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM information_schema.tables
    WHERE table_name = 'site_revisions'`;
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'site_revisions' ORDER BY ordinal_position`;

  console.log(`site_revisions present: ${count === "1" ? "yes" : "NO"}`);
  console.log(`columns: ${cols.map((c) => c.column_name).join(", ")}`);
  await sql.end();
}

void main();
