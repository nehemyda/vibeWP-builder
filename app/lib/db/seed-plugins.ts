/**
 * Seeds the default plugin stack.
 * Safe to re-run — existing rows are left exactly as an administrator left them.
 * Run with: npx tsx lib/db/seed-plugins.ts
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS LIST AND NOT THE ONE IN architecture.md
 *
 * That document lists WP Rocket and UpdraftPlus Premium. Both are paid, need a
 * licence key entered per install, and cannot be fetched from a slug — a row
 * for either would be a promise `wp plugin install` cannot keep. Where a free
 * equivalent exists it is used and named; where it does not, the row is absent
 * rather than aspirational.
 *
 * WooCommerce is deliberately absent too. It changes what a site IS, and
 * installing it on every site would put a shop on a plumber's website. It
 * needs a per-site condition this table does not have yet.
 * ─────────────────────────────────────────────────────────────────────
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./index";
import { platformPlugins } from "./schema";

const DEFAULT_PLUGINS = [
  {
    slug: "wordpress-seo",
    name: "Yoast SEO",
    purpose:
      "Titles, meta descriptions and sitemaps. The theme already emits our own, so this is for the client to build on rather than a gap it fills.",
    sortOrder: 0,
  },
  {
    slug: "updraftplus",
    name: "UpdraftPlus",
    purpose:
      "Scheduled backups a client controls. The free tier covers local and manual restore; the paid one adds remote destinations.",
    sortOrder: 10,
  },
  {
    slug: "wordfence",
    name: "Wordfence Security",
    purpose: "Firewall and malware scanning on a site we hand over and stop watching.",
    sortOrder: 20,
  },
  {
    slug: "w3-total-cache",
    name: "W3 Total Cache",
    purpose:
      "Page caching. Stands in for WP Rocket, which is paid and cannot be installed from a slug.",
    sortOrder: 30,
  },
];

async function main() {
  const inserted = await db
    .insert(platformPlugins)
    .values(DEFAULT_PLUGINS)
    .onConflictDoNothing()
    .returning();

  const all = await db.select().from(platformPlugins);
  console.log(`inserted ${inserted.length}, ${all.length} plugin(s) on the checklist:`);
  for (const p of all.sort((a, b) => a.sortOrder - b.sortOrder)) {
    console.log(`  ${p.slug.padEnd(18)} ${p.isActive ? "active  " : "inactive"} ${p.name}`);
  }
  process.exit(0);
}
void main();
