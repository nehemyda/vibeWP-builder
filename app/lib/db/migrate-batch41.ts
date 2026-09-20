/**
 * Raw-SQL migration: group the model calls of one client action.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch41.ts
 *
 * An edit is two model calls — plan, then revise — and the usage panel was
 * counting rows, so a client who made six edits read "12 times". Every call
 * made inside one action now carries the same request_id; the dashboard
 * counts those. Rows from before this column are left null and count as one
 * each, which is the honest reading of data that was never grouped.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  await sql`ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS request_id uuid`;
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ai_usage WHERE request_id IS NULL`;
  console.log(`ai_usage.request_id present — ${n} earlier row(s) ungrouped`);
  await sql.end();
  process.exit(0);
}
void main();
