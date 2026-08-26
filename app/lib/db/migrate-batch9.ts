/**
 * Raw-SQL migration for SMTP settings. Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch9.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      host text,
      port integer NOT NULL DEFAULT 587,
      username text,
      password text,
      from_email text,
      from_name text NOT NULL DEFAULT 'VibeWP',
      secure boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
