/**
 * Raw-SQL migration: canonicalise stored plan values.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch26.ts
 *
 * WHY
 *
 * `plans.key` is always lowercase. `sites.plan` and `agencies.plan` were not:
 * the column defaults wrote "starter" while every plan <select> in the app
 * submitted the title-case literal "Starter", so the same plan existed under
 * two spellings depending on how the row happened to be created.
 *
 * That broke the one plan gate the app has. `sectionsForPlan` compared
 * `sections.allowedPlans` — which stores keys — against the raw column, so
 * restricting a section to ["growth","scale"] hid it from EVERY site rather
 * than from the cheap ones. The gate looked enforced and enforced nothing.
 *
 * Lowercasing is safe because a plan key is by construction lowercase
 * (createPlanAction slugifies it) and the rows only ever held a plan's key or
 * its title-case name, which for every seeded plan differ by case alone.
 *
 * A row pointing at a plan that no longer exists is left as-is rather than
 * guessed at: lib/billing.ts already resolves an unknown key to a zero price
 * with source "unknown", which is the honest answer.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  const sitesUpdated = await sql`
    UPDATE sites SET plan = lower(btrim(plan)) WHERE plan <> lower(btrim(plan))`;
  const agenciesUpdated = await sql`
    UPDATE agencies SET plan = lower(btrim(plan)) WHERE plan <> lower(btrim(plan))`;

  /* Same treatment for the agency reseller price list, whose plan_key is a
     soft foreign key to plans.key and can drift the same way. */
  const pricesUpdated = await sql`
    UPDATE agency_plan_prices SET plan_key = lower(btrim(plan_key))
    WHERE plan_key <> lower(btrim(plan_key))`;

  console.log(`sites normalised:              ${sitesUpdated.count}`);
  console.log(`agencies normalised:           ${agenciesUpdated.count}`);
  console.log(`agency_plan_prices normalised: ${pricesUpdated.count}`);

  /* Report anything still pointing at a plan the catalogue doesn't have, so a
     bad row is visible rather than silently priced at zero. */
  const orphanSites = await sql<{ plan: string; n: number }[]>`
    SELECT s.plan, count(*)::int AS n FROM sites s
    LEFT JOIN plans p ON p.key = s.plan
    WHERE p.key IS NULL GROUP BY s.plan`;
  const orphanAgencies = await sql<{ plan: string; n: number }[]>`
    SELECT a.plan, count(*)::int AS n FROM agencies a
    LEFT JOIN plans p ON p.key = a.plan
    WHERE p.key IS NULL GROUP BY a.plan`;

  for (const r of orphanSites) console.log(`  WARN ${r.n} site(s) on unknown plan "${r.plan}"`);
  for (const r of orphanAgencies) console.log(`  WARN ${r.n} agency/agencies on unknown plan "${r.plan}"`);
  if (orphanSites.length === 0 && orphanAgencies.length === 0) {
    console.log("every site and agency points at a plan in the catalogue");
  }

  await sql.end();
}
void main();
