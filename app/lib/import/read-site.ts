import { safeFetch } from "@/lib/net/safe-fetch";
import { extractProfile, pageText, type ExtractedProfile } from "./structured";

/**
 * Fetching one page a client named, and reading their details off it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE PAGE, THE ONE THEY GAVE
 *
 * Not a crawler. A crawler is a different obligation — robots.txt, rate
 * limits, someone else's bandwidth — and the yield does not need it: the
 * structured data this reads is emitted site-wide by every SEO plugin that
 * emits it at all, so the home page carries the same LocalBusiness block the
 * contact page does.
 *
 * WHY THE BODY IS READ WITH A CEILING
 *
 * `response.text()` reads whatever arrives. A URL is chosen by a user, and a
 * user who points this at an endless stream should cost us one truncated
 * string rather than the process. The cap is well past any real page.
 * ─────────────────────────────────────────────────────────────────────
 */

const MAX_BYTES = 2_000_000;

export type SiteRead =
  | { ok: true; url: string; profile: ExtractedProfile; text: string; truncated: boolean }
  | { ok: false; reason: string };

/** Reads at most `limit` bytes, whatever the sender intends to send. */
async function readCapped(response: Response, limit: number): Promise<{ text: string; truncated: boolean }> {
  const body = response.body;
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    chunks.push(value);
    total += value.byteLength;
    if (total >= limit) {
      truncated = true;
      /* Stop pulling AND tell the sender, so a stream that would never end is
         actually closed rather than left draining in the background. */
      await reader.cancel().catch(() => {});
      break;
    }
  }

  return { text: Buffer.concat(chunks).toString("utf8").slice(0, limit), truncated };
}

export async function readSite(rawUrl: string): Promise<SiteRead> {
  const url = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;

  const fetched = await safeFetch(url, { timeoutMs: 15_000, maxRedirects: 3 });
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const { response } = fetched;
  if (!response.ok) {
    return { ok: false, reason: `that page answered ${response.status}` };
  }

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type && !type.includes("html")) {
    /* A PDF or an image is a URL somebody pasted by mistake, and saying so is
       more use than an empty result they have to interpret. */
    return { ok: false, reason: `that address is ${type}, not a web page` };
  }

  const { text: html, truncated } = await readCapped(response, MAX_BYTES);
  if (!html.trim()) return { ok: false, reason: "that page was empty" };

  return {
    ok: true,
    url: fetched.url,
    profile: extractProfile(html, fetched.url),
    text: pageText(html),
    truncated,
  };
}
