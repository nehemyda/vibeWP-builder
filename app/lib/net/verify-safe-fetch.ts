/**
 * The SSRF guard, asserted.
 *
 * Run with `npx tsx lib/net/verify-safe-fetch.ts`, and as part of
 * `npm run verify`. Makes no outbound requests: every case is decided by
 * address classification or local DNS.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * A guard that stops working looks exactly like a guard that works. Nothing
 * fails, no page breaks, no test goes red — the fetch simply succeeds where it
 * should have been refused, and the first sign is an incident.
 *
 * The cases below are not hypotheticals. 169.254.169.254 serves cloud
 * credentials to anything on the instance that asks. 127.0.0.1:8811 is where
 * this very codebase runs client WordPress installs with a password nobody
 * knows, reachable because it is meant to be unreachable. Both are one
 * unchecked fetch away from a server that pulls images from URLs users choose.
 * ─────────────────────────────────────────────────────────────────────
 */
import { __testing, safeFetch } from "./safe-fetch";

const { isPrivateAddress, checkUrl } = __testing;

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

/* ── addresses that must be refused ─────────────────────────────────── */
const PRIVATE = [
  ["127.0.0.1", "loopback"],
  ["127.1", "loopback, short form"],
  ["0.0.0.0", "this network"],
  ["10.0.0.1", "RFC1918"],
  ["172.16.0.1", "RFC1918"],
  ["172.31.255.254", "RFC1918 upper bound"],
  ["192.168.1.1", "RFC1918"],
  ["169.254.169.254", "CLOUD METADATA"],
  ["100.64.0.1", "CGNAT"],
  ["198.18.0.1", "benchmarking"],
  ["224.0.0.1", "multicast"],
  ["255.255.255.255", "broadcast"],
  ["::1", "IPv6 loopback"],
  ["::", "IPv6 unspecified"],
  ["fd00::1", "IPv6 unique-local"],
  ["fe80::1", "IPv6 link-local"],
  ["::ffff:127.0.0.1", "IPv4 loopback mapped into IPv6"],
  ["::ffff:169.254.169.254", "METADATA mapped into IPv6"],
  ["64:ff9b::7f00:1", "NAT64"],
  ["not-an-address", "unparseable"],
] as const;

for (const [ip, why] of PRIVATE) {
  if (!isPrivateAddress(ip)) fail(`${ip} (${why}) was treated as public`);
}
console.log(`  ok   ${PRIVATE.length} private/reserved addresses refused`);

/* ── addresses that must still work, or the guard blocks the internet ── */
const PUBLIC = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "172.15.0.1", "2606:4700::1111"];
for (const ip of PUBLIC) {
  if (isPrivateAddress(ip)) fail(`${ip} is public and was refused`);
}
console.log(`  ok   ${PUBLIC.length} public addresses allowed (incl. 172.15/172.32, just outside RFC1918)`);

/* ── whole URLs ──────────────────────────────────────────────────────── */
async function main() {
  const refuse: Array<[string, string]> = [
    ["http://127.0.0.1:8811/", "a client's local WordPress"],
    ["http://localhost:3000/admin", "localhost by name"],
    ["http://169.254.169.254/latest/meta-data/", "cloud metadata"],
    ["http://[::1]:3000/", "IPv6 loopback in brackets"],
    ["file:///etc/passwd", "a file path"],
    ["gopher://127.0.0.1:11211/", "a non-web scheme"],
    ["javascript:alert(1)", "a script URL"],
    ["not a url at all", "not a URL"],
  ];

  for (const [url, why] of refuse) {
    const r = await checkUrl(url);
    if (r.ok) fail(`${why}: ${url} was allowed`);
    else console.log(`  ok   refused ${why.padEnd(28)} ${r.reason}`);
  }

  /* A name that resolves to loopback. Every machine has one, so this needs no
     network and no attacker-controlled domain. */
  const byName = await checkUrl("http://localhost/");
  if (byName.ok) fail("a hostname resolving to 127.0.0.1 was allowed");
  else console.log(`  ok   refused a name resolving inward      ${byName.reason}`);

  const direct = await safeFetch("http://127.0.0.1:1/", { timeoutMs: 2_000 });
  if (direct.ok) fail("safeFetch reached a loopback address");
  else console.log(`  ok   safeFetch refused loopback           ${direct.reason}`);

  /*
   * THE REDIRECT HOP, which is where a one-hop guard fails and where nothing
   * else here would catch it. The first URL is a genuinely public literal
   * address, so it passes the opening check exactly as an attacker's own
   * domain would; the answer then points at the metadata service.
   *
   * fetch is stubbed rather than a server being stood up, because the thing
   * under test is the loop's re-validation, not the network. A real public
   * host that redirects inward is not something to depend on in a gate.
   */
  const realFetch = globalThis.fetch;
  const hops: string[] = [];
  globalThis.fetch = (async (input: Request | string | URL) => {
    const u = String(input instanceof Request ? input.url : input);
    hops.push(u);
    return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
  }) as typeof fetch;

  try {
    const viaRedirect = await safeFetch("http://1.1.1.1/", { timeoutMs: 2_000 });
    if (viaRedirect.ok) {
      fail("a public URL redirecting to cloud metadata was followed");
    } else if (!/private/i.test(viaRedirect.reason)) {
      fail(`redirect refused for the wrong reason: ${viaRedirect.reason}`);
    } else {
      console.log(`  ok   refused a redirect to metadata      ${viaRedirect.reason}`);
    }
    if (hops.some((h) => h.includes("169.254.169.254"))) {
      fail("the metadata address was actually REQUESTED before being refused");
    } else {
      console.log("  ok   the metadata address was never requested");
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(fails === 0 ? "\nSSRF GUARD HOLDS" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
}

void main();
