/**
 * Adds builder_messages — the builder chat transcript, so reloading no
 * longer wipes the conversation.
 * Safe to re-run. Run with: npx tsx lib/db/migrate-batch16.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS builder_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id),
      role text NOT NULL,
      text text NOT NULL,
      steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  // Always read oldest-first for one site.
  await sql`
    CREATE INDEX IF NOT EXISTS builder_messages_site_id_created_at_idx
      ON builder_messages (site_id, created_at);
  `;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
