/**
 * Raw-SQL migration: take Yoast off the plugin checklist.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch38.ts
 *
 * WHY
 *
 * The theme is the SEO layer. inc/seo.php says so in its own comment — a
 * client's meta tags should not depend on software we install and they must
 * maintain — and it emits titles, descriptions, canonicals, robots, noindex
 * and LocalBusiness from the SEO fields they edit in our builder.
 *
 * The checklist then installed a second SEO layer on every site. Measured on a
 * real install, with Yoast active:
 *
 *   - Setting _yoast_wpseo_metadesc put TWO <meta name="description"> tags on
 *     the page, ours and Yoast's, disagreeing. Filling that field is what
 *     installing Yoast is FOR, so this fires the first time it is used as
 *     intended.
 *   - Two JSON-LD graphs: the theme's LocalBusiness and Yoast's Organization.
 *     For a local business the first is the correct type; the second competes
 *     with it.
 *   - Yoast replaces core's sitemap (/wp-sitemap.xml now 301s). The theme's
 *     noindex filter hooks wp_sitemaps_posts_query_args — core's sitemap — so
 *     it now guards a file nobody is served, and a noindex page would be
 *     listed in Yoast's as worth crawling.
 *
 * Configuring it was the alternative and would have made two of those worse,
 * because both only fire once its fields are filled in.
 *
 * DEACTIVATED, NOT DELETED. An admin opening the screen should see a plugin we
 * deliberately do not install, and why, rather than an absence to guess at —
 * and a row is how they put it back if they disagree.
 *
 * DOES NOT TOUCH ANY WORDPRESS INSTALL. Yoast stays installed and active on
 * every site that already has it; a plugin running on a client's site is
 * theirs. This changes which plugins reach the NEXT site.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const OLD_PURPOSE =
  "Titles, meta descriptions and sitemaps. The theme already emits our own, so this is for the client to build on rather than a gap it fills.";

const NEW_PURPOSE =
  "OFF THE CHECKLIST — the theme is the SEO layer and two of them collide. " +
  "Measured on a real install: filling Yoast's description field puts TWO " +
  "meta description tags on the page; Yoast's Organization JSON-LD competes " +
  "with the theme's LocalBusiness; and Yoast replaces core's sitemap, which " +
  "is the one the theme filters noindex pages out of. Left here, switched " +
  "off, so the decision is visible and reversible.";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  const off = await sql<{ slug: string }[]>`
    UPDATE platform_plugins
       SET is_active = false, updated_at = now()
     WHERE slug = 'wordpress-seo'
       AND is_active = true
    RETURNING slug`;
  console.log(off.length ? "wordpress-seo: taken off the checklist" : "wordpress-seo: already off (or absent)");

  /* Only if nobody has rewritten it — purpose is admin-editable. */
  const text = await sql<{ slug: string }[]>`
    UPDATE platform_plugins
       SET purpose = ${NEW_PURPOSE}, updated_at = now()
     WHERE slug = 'wordpress-seo'
       AND purpose = ${OLD_PURPOSE}
    RETURNING slug`;
  console.log(text.length ? "wordpress-seo: reason recorded" : "wordpress-seo: purpose left as edited");

  const rows = await sql<{ slug: string; is_active: boolean; auto_activate: boolean }[]>`
    SELECT slug, is_active, auto_activate FROM platform_plugins ORDER BY sort_order`;
  console.log(`\nchecklist — ${rows.filter((r) => r.is_active).length} of ${rows.length} row(s) reach a new site:`);
  for (const r of rows) {
    console.log(
      `  ${r.slug.padEnd(16)} ${r.is_active ? "INSTALLED" : "not installed"}  ${
        r.is_active ? (r.auto_activate ? "and activated" : "install only") : ""
      }`,
    );
  }

  await sql.end();
  process.exit(0);
}
void main();
