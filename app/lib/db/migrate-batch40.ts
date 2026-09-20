/**
 * Raw-SQL migration: the AI usage ledger.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch40.ts
 *
 * One row per model call. Nothing enforces anything from it yet — this is the
 * measurement that has to exist before an allowance can be set honestly (see
 * lib/ai/usage.ts). Tokens are stored as reported; the credit rate lives in
 * code, so changing what a credit means never rewrites history.
 *
 * Both indexes lead with the owner and end with time, because every question
 * this table will be asked is "how much did X spend between these dates".
 * agency_id has no foreign key on purpose: it records who a site belonged to
 * WHEN the call was made, and must survive the agency going away.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      agency_id uuid,
      user_id uuid,
      action text NOT NULL,
      model text NOT NULL,
      prompt_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      thought_tokens integer NOT NULL DEFAULT 0,
      cached_tokens integer NOT NULL DEFAULT 0,
      total_tokens integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;

  await sql`CREATE INDEX IF NOT EXISTS ai_usage_site_created_idx ON ai_usage (site_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS ai_usage_agency_created_idx ON ai_usage (agency_id, created_at)`;

  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ai_usage`;
  console.log(`ai_usage present — ${n} call(s) recorded`);

  await sql.end();
  process.exit(0);
}
void main();
