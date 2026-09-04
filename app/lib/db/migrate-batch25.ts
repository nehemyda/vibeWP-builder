/**
 * Raw-SQL migration: lead status and notes.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch25.ts
 *
 * WHY STATUS LIVES ON THE SUBMISSION
 *
 * It is a fact about this enquiry, not about the form that produced it, and it
 * has to survive the form being deleted — which form_id already does by going
 * null. A separate pipeline table would be a second place to keep in step.
 *
 * WHY NOTES ARE A TABLE AND NOT A TEXT COLUMN
 *
 * "Called, left voicemail" is only useful with a date and a name attached, and
 * two people working the same lead would overwrite each other in one column.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'`;
  /* Won deals carry a value, so a dashboard can say what the site earned. */
  await sql`ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS value_cents integer`;
  await sql`ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS status_changed_at timestamptz`;

  /* The list filters by status within a site, newest first — every query. */
  await sql`
    CREATE INDEX IF NOT EXISTS form_submissions_site_status_idx
      ON form_submissions (site_id, status, received_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id uuid NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
      body text NOT NULL,
      author_user_id uuid,
      author_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS lead_notes_submission_idx ON lead_notes (submission_id, created_at)`;

  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='form_submissions' AND column_name IN ('status','value_cents','status_changed_at')`;
  const t = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_name='lead_notes'`;
  console.log(`form_submissions gained: ${cols.map((c) => c.column_name).join(", ")}`);
  console.log(`lead_notes present: ${t.length === 1 ? "yes" : "NO"}`);
  await sql.end();
}
void main();
