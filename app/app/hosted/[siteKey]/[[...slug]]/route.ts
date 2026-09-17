import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, sitePages, businessProfiles, siteInstallations } from "@/lib/db/schema";
import { withPreviewPlaceholders } from "@/lib/wp/serialize";
import { withStaticForms } from "@/lib/forms/inject";
import { resolveBrandColors } from "@/lib/brand/palettes";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";
import { composePageBody, pageTitle, renderSiteDocument } from "@/lib/render/page-document";
import { SUBDOMAIN, domainVariants, normalizeDomain, vibeSiteUrl } from "@/lib/render/hosting";
import { storedLogoUrl } from "@/lib/media/adopt";
import { localBusinessJsonLd, robotsTxt, sitemapXml, socialMetaTags } from "@/lib/render/seo";
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
 * WHY siteKey IS TWO THINGS
 *
 * proxy.ts sends both a subdomain ("acme") and a whole custom host
 * ("acme.co.uk") here, because deciding which site a host belongs to needs the
 * database and Proxy is explicitly not the place for data fetching. One
 * segment, resolved once, in the one place that already has a connection.
 *
 * WHY THE PATH IS REACHABLE DIRECTLY
 *
 * Nothing stops someone typing /hosted/acme on the app's own domain. Rather
 * than try to forbid that, every response carries a canonical link to the
 * site's real address, and a request that did NOT arrive through the rewrite
 * is additionally marked noindex — so one page never competes with itself.
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

/** The site this subdomain or custom host belongs to, whatever mode it is in. */
async function siteFor(siteKey: string) {
  if (SUBDOMAIN.test(siteKey)) {
    return db.query.sites.findFirst({
      where: and(eq(sites.vibeSubdomain, siteKey), isNull(sites.deletedAt)),
    });
  }

  const domain = normalizeDomain(siteKey);
  if (!domain) return undefined;

  /* Both spellings, because a client points www at us as well as the apex and
     expects both to work — see domainVariants. */
  return db.query.sites.findFirst({
    where: and(inArray(sites.domain, domainVariants(domain)), isNull(sites.deletedAt)),
  });
}

/**
 * Where a site that has left Vibe now lives.
 *
 * An upgrade to WordPress moves the site, and export rewrites the stored
 * schema to point at the install's own media — so continuing to render here
 * would serve a page whose images are somewhere else. A permanent redirect
 * tells a search engine the address changed rather than that the site
 * vanished, which is the difference between keeping its ranking and losing it.
 */
async function movedTo(siteId: string): Promise<string | null> {
  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, siteId),
  });
  return installation?.status === "ready" ? (installation.url ?? null) : null;
}

export async function GET(request: Request, ctx: { params: Promise<{ siteKey: string; slug?: string[] }> }) {
  const { siteKey, slug } = await ctx.params;

  const site = await siteFor(siteKey);
  if (!site) return notFound();

  if (site.mode !== "vibe") {
    const url = await movedTo(site.id);
    return url ? new Response(null, { status: 301, headers: { Location: url } }) : notFound();
  }
  if (site.status !== "live") return notFound();

  /*
   * One level only, because sitePages.slug is flat. A deeper path is a real
   * 404 rather than something to trim down to its first segment — silently
   * serving /services for /services/emergency would tell a search engine the
   * deep page exists.
   */
  if (slug && slug.length > 1) return notFound();
  const wanted = slug?.[0] || "home";

  const pages = await db
    .select()
    .from(sitePages)
    .where(eq(sitePages.siteId, site.id))
    .orderBy(sitePages.createdAt);

  /*
   * A site's own address, preferring the domain its owner set.
   *
   * The canonical link, the sitemap and the structured data all have to agree
   * on ONE address, or they describe two sites. The custom domain wins because
   * it is the one a client puts on a van.
   */
  const home =
    (site.domain ? `https://${normalizeDomain(site.domain)}` : null) ??
    vibeSiteUrl(site.vibeSubdomain);

  if (wanted === "sitemap.xml" && home) {
    return new Response(
      sitemapXml(
        home,
        pages.filter((p) => !p.noIndex).map((p) => p.slug),
      ),
      { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  if (wanted === "robots.txt" && home) {
    return new Response(robotsTxt(home), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

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

  /*
   * The logo as a file, if publish has taken it in. Falling back to the stored
   * data URL keeps a logo changed since the last publish visible — heavier
   * than it should be, but present, which a 404 would not be.
   */
  const storedLogo = await storedLogoUrl(site.id, profile?.logoUrl);
  const logoUrl = storedLogo ?? profile?.logoUrl ?? undefined;

  const withChrome = withPreviewPlaceholders(body, {
    target: "live",
    businessName: site.name,
    facts,
    logoUrl,
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

  const canonical = home ? (wanted === "home" ? `${home}/` : `${home}/${wanted}`) : null;
  const viaHost = request.headers.get(VIA_HOST);

  /*
   * The page's OWN meta tags win, then a sensible derivation.
   *
   * site_pages.meta_title and friends are what the SEO panel writes and what
   * export sends to WordPress as post meta. A Vibe page has to read the same
   * fields or the identical page would describe itself one way on our hosting
   * and another way after an upgrade — and the client would have edited the
   * ones that stopped applying.
   */
  const title =
    page.metaTitle?.trim() ||
    (page.title?.trim() && wanted !== "home" ? `${page.title.trim()} — ${site.name}` : site.name);
  const description =
    page.metaDescription?.trim() || profile?.aboutText?.trim()?.slice(0, 300) || null;

  /* An explicit canonical overrides the address we would have chosen — that is
     the entire point of the field. */
  const pageCanonical = page.canonicalUrl?.trim() || canonical;

  /* Already absolute: the media bucket serves on its own host, which is also
     why a crawler building a link preview can fetch it. The stored data URL
     cannot be fetched, so it is not offered as one. */
  const absoluteLogo = storedLogo;

  /* Structured data describes the BUSINESS, so it belongs on the page that
     represents it rather than on all of them. */
  const jsonLd =
    wanted === "home" && home
      ? localBusinessJsonLd(
          {
            name: site.name,
            phone: profile?.phoneNumber,
            email: profile?.email,
            address: profile?.address,
            city: profile?.city,
            postcode: profile?.zip,
            about: profile?.aboutText,
            logoUrl: absoluteLogo,
          },
          home,
        )
      : null;

  const head = [
    socialMetaTags({ title, description, canonical: pageCanonical, siteName: site.name, imageUrl: absoluteLogo }),
    jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const document = renderSiteDocument({
    body: html,
    // The page's own title carries the business name only on the home page,
    // where there is nothing more specific to say.
    title,
    description,
    colors: resolveBrandColors(site.brandPaletteKey, site.brandColors),
    canonical: pageCanonical,
    noindex: !viaHost || page.noIndex,
    head,
  });

  return new Response(document, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...(viaHost && !page.noIndex ? {} : { "X-Robots-Tag": "noindex" }),
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
