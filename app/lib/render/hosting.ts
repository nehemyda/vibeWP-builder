/**
 * Where Vibe sites are served from.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY AN ENV VAR AND NOT platform_settings
 *
 * hosting_ipv4 / hosting_cname are admin-editable because they are what a
 * client is TOLD to point their registrar at — copy, essentially. This is
 * different: serving `*.example.com` requires a wildcard DNS record and a
 * wildcard certificate to already exist. An admin ticking a box cannot make
 * that true, so the value belongs where the deployment is described.
 *
 * Unset means platform hosting is off, and everything about it stays inert:
 * no host rewriting, and publish refuses a Vibe site rather than inventing an
 * address nothing answers on.
 *
 * Locally, `localhost:3000` works — browsers resolve any *.localhost to the
 * loopback, so http://acme.localhost:3000 reaches the dev server.
 * ─────────────────────────────────────────────────────────────────────
 */
export function sitesHost(): string | null {
  const raw = process.env.VIBEWP_SITES_HOST?.trim().toLowerCase();
  return raw ? raw.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;
}

/** http in development, https anywhere a real host is configured. */
export function sitesProtocol(): "http" | "https" {
  const host = sitesHost() ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
}

/** The public address of a published Vibe site, or null when hosting is off. */
export function vibeSiteUrl(subdomain: string | null | undefined): string | null {
  const host = sitesHost();
  if (!host || !subdomain) return null;
  return `${sitesProtocol()}://${subdomain}.${host}`;
}

/**
 * The subdomain a request's Host header is asking for, or null.
 *
 * Returns null for the bare hosting host itself, so that `example.com` is not
 * read as a site named "" — and for anything that is not under it at all,
 * which is every request to the app's own domain.
 */
export function subdomainFromHost(rawHost: string | null | undefined): string | null {
  const host = sitesHost();
  if (!host || !rawHost) return null;

  /*
   * The port is stripped from both sides before comparing.
   *
   * Which port a request arrived on says nothing about which site it is for —
   * behind a proxy it is 3000 or 8080 whatever the public address was, and in
   * development it changes run to run. Matching on it made the same site
   * resolve or not depending on how the server happened to be started.
   */
  const incoming = rawHost.trim().toLowerCase().replace(/:\d+$/, "");
  const suffix = host.replace(/:\d+$/, "");

  if (!incoming.endsWith(`.${suffix}`)) return null;
  const sub = incoming.slice(0, -(suffix.length + 1));
  return SUBDOMAIN.test(sub) ? sub : null;
}

/** What a subdomain may be. Also what a stored one is validated against. */
export const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Names that must never become a site's address.
 *
 * Some would shadow infrastructure we or a certificate authority rely on;
 * the rest would let a site impersonate us to its own visitors. Claiming
 * "admin.<our domain>" is a phishing page with our name on it.
 */
const RESERVED = new Set([
  "www", "app", "api", "admin", "dashboard", "builder", "agency", "login",
  "register", "mail", "smtp", "imap", "pop", "ftp", "ns", "ns1", "ns2", "mx",
  "cdn", "static", "assets", "img", "images", "media", "files", "download",
  "status", "support", "help", "docs", "blog", "shop", "store", "billing",
  "account", "accounts", "auth", "sso", "test", "staging", "dev", "preview",
  "internal", "localhost", "vibewp", "_domainkey", "autodiscover", "autoconfig",
]);

/**
 * A candidate subdomain from a business name, or null if nothing usable is left.
 *
 * Deliberately lossy and boring: a host label may only be letters, digits and
 * hyphens, so anything else is dropped rather than transliterated. Callers
 * must still check availability — this proposes, it does not reserve.
 */
export function subdomainFrom(name: string): string | null {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");

  if (!slug || slug.length < 3 || RESERVED.has(slug) || !SUBDOMAIN.test(slug)) return null;
  return slug;
}

export function isReserved(sub: string): boolean {
  return RESERVED.has(sub);
}
