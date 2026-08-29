/**
 * Raw-SQL migration: a form owns its own embed identity.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch23.ts
 *
 * WHY THE TOKEN MOVES OFF `sites`
 *
 * It lived on the site while a form was a section of a site's own website.
 * A CRM form is not that: one form may be embedded on several pages and
 * several sites — the client's WordPress, a landing page, someone else's
 * platform — and must be revocable on its own without disturbing the others.
 * Identity therefore belongs to the form.
 *
 * `sites.form_token` is dropped rather than left behind: an unused column that
 * still looks authoritative is how the next person wires the wrong one up.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS embed_token text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS form_definitions_embed_token_idx
      ON form_definitions (embed_token) WHERE embed_token IS NOT NULL`;

  /* Whether the form still accepts submissions, without deleting its leads. */
  await sql`ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`;

  await sql`ALTER TABLE sites DROP COLUMN IF EXISTS form_token`;

  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'form_definitions' AND column_name IN ('embed_token','is_active')`;
  const gone = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'form_token'`;

  console.log(`form_definitions gained: ${cols.map((c) => c.column_name).join(", ")}`);
  console.log(`sites.form_token removed: ${gone.length === 0 ? "yes" : "NO"}`);
  await sql.end();
}

void main();
