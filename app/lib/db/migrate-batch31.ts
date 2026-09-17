/**
 * Raw-SQL migration: per-site delivery mode, and which plans sell WordPress.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch27.ts
 *
 * WHY EXISTING SITES ARE NOT LEFT ON THE DEFAULT
 *
 * `sites.mode` defaults to "vibe" — the honest description of a site with no
 * WordPress behind it, and the mode someone gets without paying. But applying
 * that default to rows that already HAVE a WordPress would reclassify every
 * live client site as one we host, hiding their Export and WP Admin controls
 * and telling them their install does not exist. So anything with a
 * site_installations row is set to "wordpress" explicitly, and the default is
 * left to govern only new rows.
 *
 * WHY includes_wordpress IS SEEDED ONLY ON FIRST RUN
 *
 * Which tier sells WordPress is an admin's decision, editable at
 * /admin/billing. Seeding the paid plans on every run would silently undo
 * theirs. So the backfill happens only in the run that creates the column.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  /* CREATE TYPE has no IF NOT EXISTS before PG 16, and this has to be
     re-runnable on whatever the host is running. */
  await sql`
    DO $$ BEGIN
      CREATE TYPE site_mode AS ENUM ('vibe', 'wordpress');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`;

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS mode site_mode NOT NULL DEFAULT 'vibe'`;

  /* Every site that already has an install is a WordPress site, whatever the
     column default says. Idempotent: re-running matches the same rows. */
  const reclassified = await sql`
    UPDATE sites SET mode = 'wordpress'
    WHERE mode <> 'wordpress'
      AND id IN (SELECT site_id FROM site_installations)`;

  const planColumnExisted = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'includes_wordpress'`;

  await sql`
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS includes_wordpress boolean NOT NULL DEFAULT false`;

  let seeded = 0;
  if (planColumnExisted.length === 0) {
    /* A free plan is the Vibe tier; anything charged for carries WordPress.
       First run only — see the note above. */
    const r = await sql`
      UPDATE plans SET includes_wordpress = true WHERE price_monthly_cents > 0`;
    seeded = r.count;
  }

  const modes = await sql<{ mode: string; n: number }[]>`
    SELECT mode, count(*)::int AS n FROM sites GROUP BY mode ORDER BY mode`;
  const wp = await sql<{ key: string }[]>`
    SELECT key FROM plans WHERE includes_wordpress ORDER BY sort_order`;

  console.log(`sites reclassified to wordpress: ${reclassified.count}`);
  console.log(`plans seeded as WordPress-capable: ${planColumnExisted.length === 0 ? seeded : "skipped (column already existed)"}`);
  console.log(`sites by mode: ${modes.map((m) => `${m.mode}=${m.n}`).join(", ")}`);
  console.log(`plans selling WordPress: ${wp.map((p) => p.key).join(", ") || "(none)"}`);

  /* A WordPress site on a plan that does not sell WordPress can exist — an
     admin can downgrade one — and the gate will refuse its next export. Say
     so here rather than letting it surface as a confusing refusal later. */
  const stranded = await sql<{ smb_id: string; plan: string }[]>`
    SELECT s.smb_id, s.plan FROM sites s
    LEFT JOIN plans p ON p.key = s.plan
    WHERE s.mode = 'wordpress' AND coalesce(p.includes_wordpress, false) = false`;
  for (const r of stranded) {
    console.log(`  WARN ${r.smb_id} is in WordPress mode on plan "${r.plan}", which does not include it`);
  }
  if (stranded.length === 0) console.log("every WordPress site is on a plan that includes it");

  await sql.end();
}
void main();
