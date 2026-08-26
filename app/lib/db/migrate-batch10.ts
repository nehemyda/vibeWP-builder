/**
 * Raw-SQL migration adding the undo/redo stack marker. Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch10.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  // Every existing row is a pre-edit snapshot, which is exactly what the undo
  // stack holds — so the NOT NULL DEFAULT backfills correctly with no separate
  // UPDATE. Redo stacks simply start empty.
  await sql`
    ALTER TABLE page_revisions
      ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'undo';
  `;

  // Undo and redo both want "newest row on this page for this stack".
  await sql`
    CREATE INDEX IF NOT EXISTS page_revisions_page_id_kind_created_at_idx
      ON page_revisions (page_id, kind, created_at DESC);
  `;

  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM page_revisions WHERE kind = 'undo';
  `;
  console.log(`Migration complete. ${count} existing revision(s) marked as undo history.`);

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
