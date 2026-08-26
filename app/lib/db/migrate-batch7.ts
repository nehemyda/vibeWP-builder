/**
 * One-off raw-SQL migration for the agency-lifecycle / business-details /
 * activity-log / billing / settings batch. drizzle-kit push crashes on this
 * project's DB state (see drizzle.config.ts comment), so schema changes are
 * applied by hand here instead. Safe to re-run — every statement is
 * idempotent (IF NOT EXISTS / DO $$ guards). Run with: npx tsx lib/db/migrate-batch7.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    DO $$ BEGIN
      CREATE TYPE agency_status AS ENUM ('active', 'suspended', 'archived', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;
  await sql`
    DO $$ BEGIN
      CREATE TYPE business_profile_owner_type AS ENUM ('agency', 'site');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;

  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS status agency_status NOT NULL DEFAULT 'active';`;
  await sql`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS deleted_at timestamptz;`;

  await sql`
    CREATE TABLE IF NOT EXISTS business_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_type business_profile_owner_type NOT NULL,
      owner_id uuid NOT NULL,
      address text,
      city text,
      state text,
      zip text,
      country text,
      website_address text,
      customer_id text,
      market text,
      business_categories text,
      tags text,
      salesperson text,
      timezone text,
      lists text,
      additional_salespeople text,
      phone_number text,
      call_tracking_number text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT business_profiles_owner_key UNIQUE (owner_type, owner_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id uuid,
      actor_name text NOT NULL,
      action text NOT NULL,
      target_type text NOT NULL,
      target_id text,
      target_label text,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);`;

  await sql`
    CREATE TABLE IF NOT EXISTS plans (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL UNIQUE,
      name text NOT NULL,
      price_monthly_cents integer NOT NULL DEFAULT 0,
      features jsonb NOT NULL DEFAULT '[]',
      site_limit integer,
      seat_limit integer,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      platform_name text NOT NULL DEFAULT 'VibeWP',
      support_email text,
      default_timezone text NOT NULL DEFAULT 'America/New_York',
      maintenance_mode boolean NOT NULL DEFAULT false,
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
