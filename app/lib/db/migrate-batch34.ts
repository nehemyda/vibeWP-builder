/**
 * Raw-SQL migration: platform-wide design defaults.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch34.ts
 *
 * Nullable, with no backfill. Null means "whatever the stylesheet does when a
 * token is unset", which is exactly what every site rendered before this
 * column existed — so adding it changes nothing until an administrator moves
 * a slider. verify-tokens.ts is what makes that claim checkable rather than
 * hopeful: it asserts every token unset renders byte-identically.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS design_tokens jsonb`;

  const rows = await sql<{ design_tokens: unknown }[]>`
    SELECT design_tokens FROM platform_settings LIMIT 1`;
  console.log("platform_settings.design_tokens present");
  console.log(`current value: ${rows.length ? JSON.stringify(rows[0].design_tokens) : "(no settings row yet)"}`);

  await sql.end();
}
void main();
