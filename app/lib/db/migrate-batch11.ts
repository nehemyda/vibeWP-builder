/**
 * Adds site_members table (SMB-level team, mirrors agency_members).
 * Safe to re-run. Run with: npx tsx lib/db/migrate-batch11.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TYPE role ADD VALUE IF NOT EXISTS 'smb_member';`;

  await sql`
    CREATE TABLE IF NOT EXISTS site_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id),
      user_id uuid NOT NULL REFERENCES profiles(id),
      role text NOT NULL DEFAULT 'member'
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
