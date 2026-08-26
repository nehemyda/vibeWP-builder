/**
 * Adds site_installations — where each site's actual WordPress lives.
 * Safe to re-run. Run with: npx tsx lib/db/migrate-batch14.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    DO $$ BEGIN
      CREATE TYPE installation_status AS ENUM ('provisioning', 'ready', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS site_installations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL UNIQUE REFERENCES sites(id),
      driver text NOT NULL DEFAULT 'local',
      status installation_status NOT NULL DEFAULT 'provisioning',
      install_path text,
      url text,
      port integer,
      db_name text,
      admin_user text,
      last_error text,
      last_exported_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
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
