/**
 * Raw-SQL migration adding admin-controlled overlay fields to sections.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch13.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE sections ADD COLUMN IF NOT EXISTS ai_prompt_override text;`;
  await sql`ALTER TABLE sections ADD COLUMN IF NOT EXISTS preview_image_url text;`;
  await sql`
    ALTER TABLE sections
      ADD COLUMN IF NOT EXISTS allowed_plans jsonb NOT NULL DEFAULT '[]'::jsonb;
  `;

  // Null override means "use the prompt the section declares in code", so
  // existing rows need no backfill — and an empty allowed_plans means every
  // plan, which is the right default for sections already in use.
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM sections;`;
  console.log(`Migration complete. ${total} section row(s) now carry overlay fields.`);

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
