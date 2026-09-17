/**
 * What a served page tells search engines and link previews about itself.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE JSON-LD IS DUPLICATED FROM PHP
 *
 * The LocalBusiness block lives in the theme, in
 * inc/business-details.php — which runs only on WordPress. A Vibe site has no
 * PHP, so without this its structured data would simply not exist, and the
 * whole reason opening hours are collected as a structured week rather than a
 * sentence is that Google can show them in local results. A text blob cannot
 * produce that.
 *
 * The two are kept deliberately identical in SHAPE, so a site that moves from
 * Vibe to WordPress does not change what it tells a crawler. When one changes,
 * the other has to.
 * ─────────────────────────────────────────────────────────────────────
 */

export type BusinessFacts = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  about?: string | null;
  logoUrl?: string | null;
};

/**
 * schema.org LocalBusiness for the home page.
 *
 * Only fields that are actually set are emitted — the PHP says it and it is
 * right: an empty telephone property is worse than an absent one, because a
 * crawler treats it as a fact about the business rather than a gap.
 */
export function localBusinessJsonLd(
  business: BusinessFacts,
  siteUrl: string,
): string | null {
  if (!business.name.trim()) return null;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name.trim(),
    url: siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`,
  };

  if (business.phone) data.telephone = business.phone;
  if (business.email) data.email = business.email;
  if (business.logoUrl && !business.logoUrl.startsWith("data:")) data.image = business.logoUrl;
  if (business.about?.trim()) data.description = business.about.trim().slice(0, 500);

  if (business.address) {
    const postal: Record<string, string> = {
      "@type": "PostalAddress",
      streetAddress: business.address,
    };
    if (business.city) postal.addressLocality = business.city;
    if (business.postcode) postal.postalCode = business.postcode;
    data.address = postal;
  }

  /*
   * </script> inside JSON would close the tag it sits in. Escaping the slash
   * is the standard answer and stays valid JSON — the PHP side gets this for
   * free from JSON_UNESCAPED_SLASHES being absent on that path.
   */
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function escAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Open Graph and Twitter tags.
 *
 * A client's site gets shared in messages and posts far more than it gets
 * searched for, and a link with no preview looks like a link to nothing.
 * og:image is only emitted when we hold a real URL for one — a data URL
 * cannot be fetched by a crawler, so claiming it would produce exactly the
 * broken preview this is meant to prevent.
 */
export function socialMetaTags(opts: {
  title: string;
  description?: string | null;
  canonical?: string | null;
  siteName: string;
  imageUrl?: string | null;
}): string {
  const { title, description, canonical, siteName, imageUrl } = opts;
  const tags: string[] = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:site_name" content="${escAttr(siteName)}">`,
  ];

  if (description) tags.push(`<meta property="og:description" content="${escAttr(description)}">`);
  if (canonical) tags.push(`<meta property="og:url" content="${escAttr(canonical)}">`);

  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    tags.push(`<meta property="og:image" content="${escAttr(imageUrl)}">`);
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary">`);
  }

  return tags.join("\n");
}

/** A sitemap of the pages this site actually has. */
export function sitemapXml(siteUrl: string, slugs: string[]): string {
  const base = siteUrl.replace(/\/$/, "");
  const urls = slugs
    .map((slug) => `  <url><loc>${escAttr(slug === "home" ? `${base}/` : `${base}/${slug}`)}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * robots.txt for a client's site.
 *
 * Points at their own sitemap, not ours. Nothing is disallowed: every path a
 * visitor can reach on a Vibe site is a page its owner published or an image
 * on one, and an indexed photograph is a way into a local business rather
 * than a leak.
 */
export function robotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
}
