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
      "OFF THE CHECKLIST — the theme is the SEO layer and two of them collide. " +
      "Measured on a real install: filling Yoast's description field puts TWO " +
      "meta description tags on the page; Yoast's Organization JSON-LD competes " +
      "with the theme's LocalBusiness; and Yoast replaces core's sitemap, which " +
      "is the one the theme filters noindex pages out of. Left here, switched " +
      "off, so the decision is visible and reversible.",
    /*
     * NOT DELETED, AND NOT A HALF MEASURE.
     *
     * The row's own previous text said it: "the theme already emits our own".
     * It was on the list anyway, and that overlap is not a tidiness problem.
     * inc/seo.php exists because a client's meta tags should not depend on a
     * plugin we install and they must maintain, and it does titles,
     * descriptions, canonicals, robots, noindex and LocalBusiness from the SEO
     * fields they edit in our own builder.
     *
     * Configuring Yoast would have made this worse rather than better: two of
     * the three collisions only fire once its fields are filled in, which is
     * what configuring it means.
     *
     * isActive false rather than removing the entry, so an admin opening the
     * screen sees a plugin we deliberately do not install and why, instead of
     * an absence they have to guess at.
     */
    isActive: false,
    sortOrder: 0,
  },
  {
    slug: "updraftplus",
    name: "UpdraftPlus",
    purpose:
      "Backups a client controls, once they set a schedule. Activating it schedules NOTHING — " +
      "verified on a real install: no backup interval, no destination, an empty updraft folder " +
      "and a single cleanup job. Until someone configures it, this site has no backups.",
    sortOrder: 10,
  },
  {
    slug: "wordfence",
    name: "Wordfence Security",
    purpose:
      "Firewall and malware scanning on a site we hand over and stop watching. " +
      "INSTALLED BUT NOT ACTIVATED — switch it on once the site is on real hosting " +
      "and someone is going to configure it.",
    /*
     * THE ONE PLUGIN THAT MUST NOT BE SWITCHED ON FOR US.
     *
     * Wordfence calls dns_get_record() while serving a request. Where DNS is
     * slow or unreachable — which is every machine running the local driver
     * behind a restricted network — that blocks until PHP's 30-second limit
     * kills the request, and it does it on EVERY request. Measured on a real
     * install: 30s fatal with it active, 0.55s with it off.
     *
     * The damage is not only a slow site. Export health-checks the server by
     * asking it for a page; the page never comes, so export concludes the
     * server never started and refuses to publish. One plugin activated by
     * default took the whole publish path down.
     *
     * This is the sharpest case of the rule the checklist was written with:
     * installing is not configuring. An unconfigured SEO plugin is merely
     * unhelpful. An unconfigured firewall is a firewall nobody has told what
     * to allow, making outbound calls on every page load, on a site whose
     * owner has not arrived yet.
     */
    autoActivate: false,
    sortOrder: 20,
  },
  {
    slug: "w3-total-cache",
    name: "W3 Total Cache",
    purpose:
      "Stands in for WP Rocket, which is paid and cannot be installed from a slug. Activating it " +
      "caches NOTHING — verified on a real install: page, database, object and minify cache all " +
      "off, leaving only browser-cache rules that need Apache or nginx and do nothing under the " +
      "local driver's PHP server. It is a plugin waiting to be configured, not a speed-up.",
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
