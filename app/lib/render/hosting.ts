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

/**
 * The app's own address, from NEXT_PUBLIC_APP_URL.
 *
 * Custom-domain routing needs to know which host is US, because its rule is
 * "anything that is not ours belongs to a client". Without an explicit answer
 * that rule would swallow every request — so when this is unset, custom
 * domains are simply off, and the dashboard keeps working.
 */
export function appHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase();
  if (!raw) return null;
  try {
    return new URL(raw).host.replace(/:\d+$/, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "") || null;
  }
}

/** A domain as we store and compare it: no scheme, no port, no path, lowercase. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  const host = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

  return DOMAIN.test(host) ? host : null;
}

/**
 * At least two labels, so "localhost" or a bare word is never taken for a
 * domain, and a final label containing a letter, so an IP address is not.
 *
 * A bare IP would only ever 404 — no site has one as its domain — but reading
 * one as a client's website means a health check or a direct-to-origin request
 * gets answered by the site renderer instead of the app.
 */
export const DOMAIN =
  /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z0-9-]*[a-z][a-z0-9-]*$/;

/**
 * The two spellings of one custom domain.
 *
 * A client types "acme.com" into Settings and then points www.acme.com at us
 * as well, because that is what registrars and their customers both do.
 * Serving one and 404ing the other would read as the site being broken half
 * the time, so a lookup tries both and the canonical link decides which one
 * search engines are told about.
 */
export function domainVariants(domain: string): string[] {
  const bare = domain.replace(/^www\./, "");
  return bare === domain ? [domain, `www.${domain}`] : [domain, bare];
}

/**
 * How a request's Host should be answered.
 *
 * "app"       — our own dashboard, builder and API. Session refresh applies.
 * "subdomain" — a Vibe site at <key>.<VIBEWP_SITES_HOST>.
 * "domain"    — a host that is not ours, so it is a client's own domain and
 *               the renderer resolves it against sites.domain.
 *
 * Custom domains require appHost() to be configured; without it every
 * unrecognised Host — including a bare IP, a preview URL or a proxy's own
 * name — would be mistaken for a client's site.
 */
export type HostRoute =
  | { kind: "app" }
  | { kind: "subdomain"; key: string }
  | { kind: "domain"; key: string };

export function routeForHost(rawHost: string | null | undefined): HostRoute {
  const sub = subdomainFromHost(rawHost);
  if (sub) return { kind: "subdomain", key: sub };

  const app = appHost();
  const host = (rawHost ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  if (!app || !host) return { kind: "app" };

  /* Our own host, and the bare hosting host — example.com itself is marketing,
     not a site called "". */
  const sites = sitesHost()?.replace(/:\d+$/, "");
  if (host === app || host === `www.${app}` || (sites && host === sites)) return { kind: "app" };

  const domain = normalizeDomain(host);
  return domain ? { kind: "domain", key: domain } : { kind: "app" };
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
