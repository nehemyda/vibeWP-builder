/**
 * Raw-SQL migration for the client intake form.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch18.ts
 *
 * WHY THESE COLUMNS EXTEND business_profiles RATHER THAN A NEW TABLE
 *
 * business_profiles already holds address, city, phone, categories and website,
 * and the Settings screen already edits them. A second store for the same facts
 * would drift from the first, and nothing would say which one generation should
 * believe. So the intake form and Settings write the SAME row; the form just
 * asks for more of it.
 *
 * Brand colour goes on `sites` instead, because a palette is presentation, not
 * a fact about the business — it belongs with the site it styles, and a client
 * with two sites may legitimately want two looks.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  // Contact details the profile never had a home for. Email is the one the
  // contact sections asked for and could never be filled.
  await sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS email text`;

  /*
   * Opening hours as JSON, not free text: a structured week is what lets the
   * theme render a proper table and what makes LocalBusiness JSON-LD possible.
   * A single text field would close both doors.
   */
  await sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS opening_hours jsonb`;

  // What the business does, in the owner's words — the single most useful thing
  // a generator can be given, and until now there was nowhere to put it.
  await sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS about_text text`;

  /*
   * Services the client actually sells, as an ordered list of names.
   * Authoritative: generation writes the descriptions but must not invent,
   * rename or drop one.
   */
  await sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS services jsonb`;

  await sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS seo_keywords text`;

  // Brand: the chosen preset's key, plus the resolved colours so a later edit
  // to a preset never silently restyles a site that was already built.
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_palette_key text`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_colors jsonb`;

  /*
   * Whether intake has ever been completed. Drives the dashboard button's
   * label — "Build my site" the first time, "Edit my site" after — which
   * cannot be inferred from page count, since a site can have pages from an
   * import or a WordPress pull without anyone having filled the form.
   */
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz`;

  const cols = await sql<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'business_profiles'
           AND column_name IN ('email','opening_hours','about_text','services','seo_keywords'))
       OR (table_name = 'sites'
           AND column_name IN ('brand_palette_key','brand_colors','intake_completed_at'))
    ORDER BY table_name, column_name`;

  console.log(`${cols.length}/8 columns present:`);
  for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

  await sql.end();
}

void main();
