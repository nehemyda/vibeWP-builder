import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching a URL that came from outside, without letting it reach inside.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 *
 * Several paths here fetch a URL somebody else chose: a section's image is
 * pulled in at publish and export (adoptUrl), and again to write its alt text
 * (fetchImage). Those ran with almost no checks — one tested that the scheme
 * was http(s) and the other tested nothing — so anyone who could set an image
 * URL could make this server issue a request to an address of their choosing.
 *
 * The address that matters is not on the internet. It is 169.254.169.254,
 * where a cloud instance serves its own credentials to anything that asks; or
 * 127.0.0.1:8811, where a client's WordPress is listening with no password
 * because it is meant to be unreachable; or a private range where an internal
 * service answers anyone inside the network. A server that fetches on demand
 * is inside the network.
 *
 * WHY THE CHECK IS ON THE RESOLVED ADDRESS
 *
 * A blocklist of hostnames is theatre. "localhost" is one spelling of
 * 127.0.0.1 out of many — 127.1, 0x7f.1, [::1], a domain whose A record simply
 * points there — and the only thing all of them have in common is where they
 * resolve to. So the name is resolved first and every address it yields is
 * checked. A public name that resolves inward is refused for what it is, not
 * for what it is called.
 *
 * WHY EVERY REDIRECT IS CHECKED TOO
 *
 * Otherwise the guard is one hop deep and trivially stepped around: a public
 * URL that answers 302 to http://169.254.169.254/ passes the first check and
 * lands where it likes. Redirects are followed by hand so each hop is a new
 * URL to validate.
 *
 * WHAT THIS DOES NOT STOP, STATED PLAINLY
 *
 * DNS rebinding. We resolve a name, approve the answer, then hand the NAME to
 * fetch, which resolves it again — and a resolver controlled by an attacker
 * can answer differently the second time. Closing that needs the socket to be
 * pinned to the address we approved, which Node's built-in fetch gives no hook
 * for; it needs undici's connect option, and undici is not a dependency here.
 *
 * The window is narrow and the remaining protection is real: literal private
 * addresses, every spelling of loopback, the metadata address, names that
 * resolve inward, and public-to-private redirects are all refused. But it is a
 * window, and someone reading this later should not have to discover that for
 * themselves.
 * ─────────────────────────────────────────────────────────────────────
 */

export type SafeFetchRefusal = { ok: false; reason: string };
export type SafeFetchResult = { ok: true; response: Response; url: string };

const DEFAULTS = {
  timeoutMs: 15_000,
  maxRedirects: 3,
};

/** Addresses no request from this server should ever be aimed at. */
function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);

  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;

    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback, all of it
    if (a === 169 && b === 254) return true; // link-local — cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }

  if (v === 6) {
    const ip6 = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];

    if (ip6 === "::" || ip6 === "::1") return true;

    /* An IPv4 address wearing an IPv6 hat — ::ffff:127.0.0.1 is loopback, and
       judging it as "some IPv6 address" would wave it straight through. */
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip6) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(ip6);
    if (mapped) return isPrivateAddress(mapped[1]);

    const head = ip6.split(":")[0];
    const n = parseInt(head || "0", 16);
    if ((n & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((n & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if (head === "ff00" || (n & 0xff00) === 0xff00) return true; // multicast
    if (ip6.startsWith("64:ff9b:")) return true; // NAT64 — an IPv4 address in disguise
    return false;
  }

  // Not an address we can reason about. Refuse rather than guess.
  return true;
}

/** Whether a single URL may be requested at all. */
async function checkUrl(raw: string): Promise<SafeFetchRefusal | { ok: true; url: URL }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid web address" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `${url.protocol} is not a web address` };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  /* A literal address skips DNS entirely, so it is judged directly. */
  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: "that address is on a private network" }
      : { ok: true, url };
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: "that host could not be found" };
  }

  if (addresses.length === 0) return { ok: false, reason: "that host has no address" };

  /* EVERY answer, not the first. A name with one public and one private
     address would otherwise be a coin toss decided by resolver ordering. */
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, reason: "that host resolves to a private network" };
  }

  return { ok: true, url };
}

/**
 * Fetch a URL that came from a user, or say why not.
 *
 * Redirects are followed here rather than by fetch, so each hop is checked.
 * The caller gets the final Response and the URL it actually came from.
 */
export async function safeFetch(
  raw: string,
  opts: { timeoutMs?: number; maxRedirects?: number; headers?: Record<string, string> } = {},
): Promise<SafeFetchResult | SafeFetchRefusal> {
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxRedirects = opts.maxRedirects ?? DEFAULTS.maxRedirects;

  let target = raw;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const checked = await checkUrl(target);
    if (!checked.ok) return checked;

    let response: Response;
    try {
      response = await fetch(checked.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: opts.headers,
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return { ok: false, reason: timedOut ? "that site took too long to answer" : "that site could not be reached" };
    }

    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return { ok: true, response, url: checked.url.toString() };

    /* Resolved against the current URL, because a redirect may be relative. */
    target = new URL(location, checked.url).toString();
  }

  return { ok: false, reason: "that address redirected too many times" };
}

/** Exported for the gate; not part of the fetching contract. */
export const __testing = { isPrivateAddress, checkUrl };
