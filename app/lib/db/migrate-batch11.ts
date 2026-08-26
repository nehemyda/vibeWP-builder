/**
 * Raw-SQL migration recording who was really behind an impersonated action.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch11.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  // Nullable with no default: existing rows genuinely have no known
  // impersonator, and inventing one would be worse than admitting the gap.
  // Historical rows produced through impersonation stay ambiguous — that is a
  // fact about the old data, not something a migration can repair.
  await sql`
    ALTER TABLE activity_log
      ADD COLUMN IF NOT EXISTS impersonator_user_id uuid;
  `;
  await sql`
    ALTER TABLE activity_log
      ADD COLUMN IF NOT EXISTS impersonator_name text;
  `;

  // Supports "show me everything this admin did while impersonating".
  await sql`
    CREATE INDEX IF NOT EXISTS activity_log_impersonator_user_id_created_at_idx
      ON activity_log (impersonator_user_id, created_at DESC)
      WHERE impersonator_user_id IS NOT NULL;
  `;

  const [{ total }] = await sql`SELECT count(*)::int AS total FROM activity_log;`;
  console.log(
    `Migration complete. ${total} existing row(s) left with a null impersonator ` +
      `(unknowable retrospectively).`,
  );

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
