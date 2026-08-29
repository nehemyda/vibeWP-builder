/**
 * Raw-SQL migration: per-form styling, stored as tokens.
 * Run with: npx tsx lib/db/migrate-batch24.ts
 *
 * Tokens — background, radius, accent — not CSS. The embed applies them as
 * scoped custom properties, so a client can restyle their form without any
 * stored text ever becoming a style rule on someone else's page.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  await sql`ALTER TABLE form_definitions ADD COLUMN IF NOT EXISTS style jsonb NOT NULL DEFAULT '{}'::jsonb`;
  const [c] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM information_schema.columns
    WHERE table_name='form_definitions' AND column_name='style'`;
  console.log(`form_definitions.style present: ${c.n === "1" ? "yes" : "NO"}`);
  await sql.end();
}
void main();
