import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, sitePages, businessProfiles } from "@/lib/db/schema";
import { withPreviewPlaceholders } from "@/lib/wp/serialize";
import { withStaticForms } from "@/lib/forms/inject";
import { resolveBrandColors } from "@/lib/brand/palettes";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";
import { composePageBody, pageTitle, renderSiteDocument } from "@/lib/render/page-document";
import { SUBDOMAIN, vibeSiteUrl } from "@/lib/render/hosting";
import type { ChromeSection } from "@/lib/render/page-document";

/**
 * A Vibe site, served to a visitor.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A ROUTE HANDLER AND NOT A PAGE
 *
 * The same reason /forms/preview/[token] is one: every page under app/ is
 * wrapped by the root layout, so returning a document from one nests it inside
 * the document that already exists — two <html> elements and markup no browser
 * should be asked to make sense of. A route handler owns its whole response,
 * which is what lets this be a client's website rather than a client's website
 * inside ours, with our fonts and resets leaking into their design.
 *
 * WHY THE PATH IS REACHABLE DIRECTLY
 *
 * proxy.ts rewrites <sub>.<VIBEWP_SITES_HOST> here, but nothing stops someone
 * typing /hosted/acme on the app's own domain. Rather than try to forbid that,
 * every response carries a canonical link to the site's real address, and a
 * request that did NOT arrive through the rewrite is additionally marked
 * noindex — so one page never competes with itself in a search index.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Set by proxy.ts on a request that arrived at a site's own host. */
const VIA_HOST = "x-vibe-site-host";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ siteKey: string; slug?: string[] }> }) {
  const { siteKey, slug } = await ctx.params;

  if (!SUBDOMAIN.test(siteKey)) return notFound();

  /*
   * One level only, because sitePages.slug is flat. A deeper path is a real
   * 404 rather than something to trim down to its first segment — silently
   * serving /services for /services/emergency would tell a search engine the
   * deep page exists.
   */
  if (slug && slug.length > 1) return notFound();
  const wanted = slug?.[0] || "home";

  const site = await db.query.sites.findFirst({
    where: and(
      eq(sites.vibeSubdomain, siteKey),
      eq(sites.mode, "vibe"),
      eq(sites.status, "live"),
      isNull(sites.deletedAt),
    ),
  });
  if (!site) return notFound();

  const pages = await db
    .select()
    .from(sitePages)
    .where(eq(sitePages.siteId, site.id))
    .orderBy(sitePages.createdAt);

  const page = pages.find((p) => p.slug === wanted);
  if (!page) return notFound();

  const profile = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerId, site.id), eq(businessProfiles.ownerType, "site")),
  });

  const businessCtx = await loadBusinessContext(site.id);
  const facts = businessCtx ? contactFactsFor(businessCtx) : {};

  /*
   * The SAME composition the builder canvas draws — see
   * lib/render/page-document.ts. If this page and the canvas ever disagree it
   * must be because of an argument, never because of a second renderer.
   */
  const body = composePageBody({
    header: site.headerSchemaJson as ChromeSection,
    footer: site.footerSchemaJson as ChromeSection,
    schema: page.schemaJson,
    hasLogo: Boolean(profile?.logoUrl),
  });

  const withChrome = withPreviewPlaceholders(body, {
    target: "live",
    businessName: site.name,
    facts,
    logoUrl: profile?.logoUrl ?? undefined,
    pages: pages.map((p) => ({ slug: p.slug, title: pageTitle(p.slug, p.title) })),
  });

  /*
   * The real, submitting form — not the canvas's drawing of one.
   *
   * Absolute endpoint on the app's own origin, exactly as export uses: the
   * site is served from a different host, and /api/forms/submit answers with
   * an open CORS header precisely so an embedded form can reach it from
   * anywhere. This also rewrites the section's /embed.js to that origin, which
   * is what gives the form its inline thank-you instead of a page reload.
   */
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const html = await withStaticForms(withChrome, `${appUrl}/api/forms/submit`);

  const home = vibeSiteUrl(site.vibeSubdomain);
  const canonical = home ? (wanted === "home" ? `${home}/` : `${home}/${wanted}`) : null;
  const viaHost = request.headers.get(VIA_HOST);

  const document = renderSiteDocument({
    body: html,
    // The page's own title carries the business name only on the home page,
    // where there is nothing more specific to say.
    title: page.title?.trim() && wanted !== "home" ? `${page.title.trim()} — ${site.name}` : site.name,
    description: profile?.aboutText?.trim()?.slice(0, 300) || null,
    colors: resolveBrandColors(site.brandPaletteKey, site.brandColors),
    canonical,
    noindex: !viaHost,
  });

  return new Response(document, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...(viaHost ? {} : { "X-Robots-Tag": "noindex" }),
      /*
       * Not cached yet. A published page changes the moment its owner edits it
       * in the builder, and there is no invalidation path — serving a stale
       * homepage for an hour would be a worse first impression than serving a
       * slow one. Caching belongs with a purge-on-save, not before it.
       */
      "Cache-Control": "no-store",
    },
  });
}
