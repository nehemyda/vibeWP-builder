/**
 * Raw-SQL migration: forms, submissions, and scoped SMTP.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch22.ts
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY jsonb AND NOT COLUMNS
 *
 * `leads` has `name` and `message` as text columns, which works only while
 * every form asks the same two questions. A client who adds "which service?"
 * has nowhere to put the answer. Submissions therefore store `data` as jsonb
 * keyed by field name, and the FORM DEFINITION says what those keys mean —
 * so a form can gain a field without a migration, and an old submission stays
 * readable against the definition that produced it.
 *
 * WHY SUBMISSIONS ARE NOT DELETED WITH THE FORM
 *
 * form_id is nullable on purpose. A lead is a person who asked to be contacted;
 * deleting the form they used must not delete them.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS form_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id),
      name text NOT NULL DEFAULT 'Contact form',
      fields jsonb NOT NULL DEFAULT '[]'::jsonb,
      notify_emails text,
      success_message text,
      redirect_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id),
      form_id uuid REFERENCES form_definitions(id) ON DELETE SET NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      spam_score integer NOT NULL DEFAULT 0,
      read_at timestamptz,
      received_at timestamptz NOT NULL DEFAULT now()
    )`;

  /* The leads list is "newest first, this site, unread first" — every query. */
  await sql`
    CREATE INDEX IF NOT EXISTS form_submissions_site_received_idx
      ON form_submissions (site_id, received_at DESC)`;

  /*
   * The shared secret WordPress signs submissions with.
   *
   * Per site, so a leaked token exposes one site rather than the platform, and
   * can be rotated without touching anyone else.
   */
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS form_token text`;

  /*
   * SMTP gains a scope so one table serves platform, agency and site.
   * Existing rows are the platform's — that is what they have always been.
   */
  await sql`ALTER TABLE smtp_settings ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global'`;
  await sql`ALTER TABLE smtp_settings ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id)`;
  await sql`ALTER TABLE smtp_settings ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id)`;

  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('form_definitions','form_submissions')`;
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE (table_name = 'smtp_settings' AND column_name IN ('scope','agency_id','site_id'))
       OR (table_name = 'sites' AND column_name = 'form_token')`;

  console.log(`tables: ${tables.map((t) => t.table_name).join(", ") || "NONE"}`);
  console.log(`columns: ${cols.map((c) => c.column_name).join(", ") || "NONE"}`);
  await sql.end();
}

void main();
