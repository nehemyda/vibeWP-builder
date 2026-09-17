/**
 * Raw-SQL migration: the address a Vibe site is served at.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch32.ts
 *
 * Nullable and unassigned. A subdomain is claimed at publish, not at
 * creation — backfilling every draft would hand out the good names to sites
 * nobody ever finished, and the name is only meaningful once something is
 * actually being served at it.
 *
 * The unique index is partial so that the many NULLs do not have to be
 * distinct — which they already are not in Postgres, but stating it keeps the
 * index small and says what the constraint is for.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS vibe_subdomain text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sites_vibe_subdomain_key
      ON sites (vibe_subdomain) WHERE vibe_subdomain IS NOT NULL`;

  const assigned = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM sites WHERE vibe_subdomain IS NOT NULL`;
  console.log(`vibe_subdomain column present; ${assigned[0].n} site(s) have one assigned`);

  await sql.end();
}
void main();
