/**
 * Dumps every public table to ../backups/ as JSON (authoritative) and as a
 * data-only .sql of INSERTs (restorable on top of a freshly migrated schema).
 *
 * Schema itself is NOT dumped — it's already reproducible from schema.ts plus
 * the migrate-batch*.ts scripts, so this only captures the rows.
 *
 * Secrets living in the database (API keys, SMTP password) are REDACTED —
 * this file is meant to be committed, and credentials must never be. They
 * have to be re-entered through the admin UI after a restore.
 *
 * Run with: npx tsx lib/db/backup-db.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

/** Columns holding live credentials — never written to disk. */
const REDACTED: Record<string, string[]> = {
  ai_provider_settings: ["gemini_api_key", "openai_api_key", "claude_api_key"],
  smtp_settings: ["password"],
};

const REDACTED_MARKER = "__REDACTED__";

/**
 * Parents before children, so the .sql can be replayed top to bottom without
 * tripping foreign keys. Any table not listed here is appended at the end.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EVERY TABLE IS NOW NAMED, INCLUDING THE DULL ONES
 *
 * Inclusion was never the issue — the dump reads pg_tables and takes
 * everything, so an unlisted table is still backed up. What it loses is its
 * PLACE, and unlisted tables were appended in alphabetical order.
 *
 * Which was FK-safe, by coincidence. form_submissions references
 * form_definitions and restored cleanly only because "form_d" sorts before
 * "form_s"; lead_notes references form_submissions and survived on "l" after
 * "f". Rename either table, or add one that sorts before its own parent, and
 * the restore fails — on the day someone is restoring, which is the worst day
 * to find out that the ordering was alphabetical rather than considered.
 *
 * So the list is now the whole schema. The cost is remembering to add a line
 * when a table is added; the alternative is a backup whose restorability
 * depends on spelling.
 * ─────────────────────────────────────────────────────────────────────
 */
export const RESTORE_ORDER = [
  "profiles",
  "agencies",
  "agency_members",
  "sites",
  "site_members",
  "site_pages",
  "leads",
  "business_profiles",
  "permissions",
  "role_permissions",
  "plans",
  "agency_plan_prices",
  "sections",
  "activity_log",
  "ai_provider_settings",
  "platform_settings",
  "smtp_settings",
  "platform_plugins",

  /* Children of sites, and of each other. */
  "site_installations",
  "site_revisions",
  "site_transfers",
  "builder_messages",
  "media_assets",
  "page_revisions",
  "form_definitions",
  "form_submissions",
  "lead_notes",
  "ai_usage",
];

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  const tableRows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const present = tableRows.map((r) => r.tablename);
  const ordered = [
    ...RESTORE_ORDER.filter((t) => present.includes(t)),
    ...present.filter((t) => !RESTORE_ORDER.includes(t)),
  ];

  const dump: Record<string, unknown[]> = {};
  const redactedHits: string[] = [];
  const lines: string[] = [
    "-- VibeWP data-only backup.",
    "-- Restore onto a freshly migrated schema (schema.ts + migrate-batch*.ts).",
    "-- Credentials are redacted — re-enter them via the admin UI after restoring.",
    "-- Deliberately carries no timestamp: identical data must produce an identical",
    "-- file, so a scheduled backup only commits when something actually changed.",
    "-- Use `git log` on this file for when each version was captured.",
    "",
    "BEGIN;",
    "",
  ];

  for (const table of ordered) {
    // Ordered by the whole row so the output is byte-stable between runs —
    // Postgres gives no ordering guarantee otherwise, and a shuffled dump
    // would look like a change to git every time.
    const rows = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT * FROM public.${ident(table)} t ORDER BY (to_jsonb(t.*))::text`,
    );

    const redactCols = REDACTED[table] ?? [];
    const cleaned = rows.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      for (const col of redactCols) {
        if (copy[col] !== null && copy[col] !== undefined) {
          copy[col] = REDACTED_MARKER;
          redactedHits.push(`${table}.${col}`);
        }
      }
      return copy;
    });

    dump[table] = cleaned;

    lines.push(`-- ${table} (${cleaned.length} rows)`);
    if (cleaned.length === 0) {
      lines.push("");
      continue;
    }
    const cols = Object.keys(cleaned[0]);
    for (const row of cleaned) {
      const values = cols.map((c) => sqlLiteral(row[c])).join(", ");
      lines.push(
        `INSERT INTO public.${ident(table)} (${cols.map(ident).join(", ")}) VALUES (${values}) ON CONFLICT DO NOTHING;`,
      );
    }
    lines.push("");
  }

  lines.push("COMMIT;", "");

  /*
   * Where the PLAINTEXT dump lands.
   *
   * Overridable so backup.sh can put it outside the repository. The dump holds
   * every client's pages, leads, form submissions and business details in the
   * clear — credentials are redacted above, client data is not and cannot be,
   * since it is the thing being backed up. Once the committed copy is
   * encrypted, the plaintext must not be written anywhere git can reach it: a
   * file that is gitignored today is one `git add -f` or one rule change away
   * from being committed, and the safe version of that is for the file not to
   * be there at all.
   */
  const outDir = process.env.VIBEWP_DUMP_DIR ?? join(process.cwd(), "..", "backups");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "db-data.json"), JSON.stringify({ tables: dump }, null, 2) + "\n");
  writeFileSync(join(outDir, "db-data.sql"), lines.join("\n"));

  const total = Object.values(dump).reduce((n, rows) => n + rows.length, 0);
  console.log(`Backed up ${ordered.length} tables, ${total} rows -> backups/`);
  if (redactedHits.length > 0) {
    console.log(`Redacted ${redactedHits.length} credential value(s): ${[...new Set(redactedHits)].join(", ")}`);
  }

  await sql.end();
  process.exit(0);
}

/*
 * Only when this file is what was run.
 *
 * verify-backup-order.ts imports RESTORE_ORDER to check it against the real
 * foreign keys, and an unguarded main() meant merely READING the order
 * performed a backup — `npm run verify` would connect to the database and
 * rewrite backups/ as a side effect of a static check.
 */
if (process.argv[1] && /backup-db\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
