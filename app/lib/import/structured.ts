import { parse, type HTMLElement } from "node-html-parser";

/**
 * Reading a business's own details off its own web page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STRUCTURED DATA FIRST, PROSE SECOND
 *
 * A phone number guessed from page text is a claim. A phone number read from
 * the site's own schema.org LocalBusiness block is the number its owner
 * published, in a field labelled "telephone", for exactly this purpose.
 *
 * That distinction is the whole design. Generation is forbidden from inventing
 * a phone number, because an invented one belongs to somebody else — the same
 * standard applies to one we scraped. So everything here is read from a place
 * where the meaning is declared: JSON-LD, Open Graph, a tel: link. Where no
 * such place exists the field is simply absent, and a person fills it in.
 *
 * Small-business sites carry this more often than one might expect, because
 * WordPress SEO plugins emit it by default — and so does our own theme, which
 * is why an exported VibeWP site reads back perfectly.
 *
 * NOTHING HERE IS TRUSTED ENOUGH TO SAVE
 *
 * Every value carries the place it came from, and the caller shows both. A
 * client confirming their own phone number takes a second; discovering a wrong
 * one on a published site takes a customer.
 * ─────────────────────────────────────────────────────────────────────
 */

export type Found<T> = { value: T; source: string };

export type ExtractedProfile = {
  businessName?: Found<string>;
  phone?: Found<string>;
  email?: Found<string>;
  address?: Found<string>;
  city?: Found<string>;
  postcode?: Found<string>;
  about?: Found<string>;
  logoUrl?: Found<string>;
  hours?: Found<Record<string, string>>;
};

const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";

/** Every JSON-LD object on the page, flattened out of @graph and arrays. */
function jsonLdNodes(root: HTMLElement): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      /* A malformed block is common and not worth failing the whole read for:
         a page often carries several and only one is broken. */
      continue;
    }

    const stack = [parsed];
    while (stack.length) {
      const item = stack.pop();
      if (Array.isArray(item)) {
        stack.push(...item);
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        out.push(obj);
        if (Array.isArray(obj["@graph"])) stack.push(...(obj["@graph"] as unknown[]));
      }
    }
  }

  return out;
}

/** The node describing the business itself, rather than the page or its author. */
function businessNode(nodes: Array<Record<string, unknown>>): Record<string, unknown> | null {
  const isBusiness = (n: Record<string, unknown>) => {
    const t = n["@type"];
    const types = (Array.isArray(t) ? t : [t]).map((x) => String(x ?? "").toLowerCase());
    /* LocalBusiness has dozens of subtypes — Dentist, Plumber, Bakery — so a
       list of names would be wrong within a week. Anything that declares a
       telephone or an address is describing a business. */
    return (
      types.some((x) => x.includes("business") || x === "organization" || x === "store") ||
      "telephone" in n ||
      "address" in n
    );
  };

  return nodes.find(isBusiness) ?? null;
}

const meta = (root: HTMLElement, sel: string): string =>
  clean(root.querySelector(sel)?.getAttribute("content"));

/** A UK postcode sitting at the end of a one-line address. */
function splitPostcode(address: string): { rest: string; postcode: string } | null {
  const m = /^(.*?)[,\s]+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i.exec(address.trim());
  return m ? { rest: m[1].replace(/[,\s]+$/, ""), postcode: m[2].toUpperCase() } : null;
}

export function extractProfile(html: string, pageUrl?: string): ExtractedProfile {
  const root = parse(html);
  const nodes = jsonLdNodes(root);
  const biz = businessNode(nodes);
  const out: ExtractedProfile = {};

  /* ── name ─────────────────────────────────────────────────────────── */
  const ldName = clean(biz?.name);
  const ogName = meta(root, 'meta[property="og:site_name"]');
  const title = clean(root.querySelector("title")?.textContent);
  if (ldName) out.businessName = { value: ldName, source: "schema.org LocalBusiness" };
  else if (ogName) out.businessName = { value: ogName, source: "og:site_name" };
  else if (title) out.businessName = { value: title.split(/[|–—-]/)[0].trim(), source: "page title" };

  /* ── phone and email ──────────────────────────────────────────────── */
  const ldPhone = clean(biz?.telephone);
  const telLink = clean(root.querySelector('a[href^="tel:"]')?.getAttribute("href")).replace(/^tel:/i, "");
  if (ldPhone) out.phone = { value: ldPhone, source: "schema.org telephone" };
  else if (telLink) out.phone = { value: telLink, source: "a tel: link on the page" };

  const ldEmail = clean(biz?.email);
  const mailLink = clean(root.querySelector('a[href^="mailto:"]')?.getAttribute("href"))
    .replace(/^mailto:/i, "")
    .split("?")[0];
  if (ldEmail) out.email = { value: ldEmail, source: "schema.org email" };
  else if (mailLink) out.email = { value: mailLink, source: "a mailto: link on the page" };

  /* ── address ──────────────────────────────────────────────────────── */
  const addr = biz?.address as Record<string, unknown> | string | undefined;
  if (addr && typeof addr === "object") {
    const street = clean(addr.streetAddress);
    const locality = clean(addr.addressLocality);
    const postal = clean(addr.postalCode);

    if (locality) out.city = { value: locality, source: "schema.org addressLocality" };
    if (postal) out.postcode = { value: postal, source: "schema.org postalCode" };

    if (street) {
      /*
       * Plenty of sites put the whole address in streetAddress and leave the
       * other fields empty — our own theme does. Splitting a postcode off the
       * end recovers two fields from one without inventing anything, since a
       * postcode is recognisable and the rest is what remains.
       */
      const split = !postal ? splitPostcode(street) : null;
      if (split) {
        out.address = { value: split.rest, source: "schema.org streetAddress" };
        out.postcode = { value: split.postcode, source: "the end of the address line" };

        /*
         * The segment before the postcode is the town, nearly always. Nearly
         * is the operative word — "Unit 3, Riverside Estate" would offer the
         * estate — so the source says it was inferred from POSITION rather
         * than declared, and the reviewer decides. Offered at all because the
         * alternative is a client retyping a town already on the page.
         */
        const parts = split.rest.split(",").map((x) => x.trim()).filter(Boolean);
        if (!locality && parts.length > 1) {
          out.city = { value: parts[parts.length - 1], source: "the part before the postcode — check this" };
        }
      } else {
        out.address = { value: street, source: "schema.org streetAddress" };
      }
    }
  } else if (typeof addr === "string" && clean(addr)) {
    out.address = { value: clean(addr), source: "schema.org address" };
  }

  /* ── about ────────────────────────────────────────────────────────── */
  const ldDesc = clean(biz?.description);
  const metaDesc = meta(root, 'meta[name="description"]') || meta(root, 'meta[property="og:description"]');
  if (ldDesc) out.about = { value: ldDesc, source: "schema.org description" };
  else if (metaDesc) out.about = { value: metaDesc, source: "the page's meta description" };

  /* ── logo ─────────────────────────────────────────────────────────── */
  const ldLogo = typeof biz?.logo === "string" ? clean(biz.logo) : clean((biz?.logo as Record<string, unknown>)?.url);
  const ogImage = meta(root, 'meta[property="og:image"]');
  const raw = ldLogo || ogImage;
  if (raw) {
    /* Relative in the markup is common, and a relative URL is no use to a
       fetcher that runs somewhere else entirely. */
    let absolute = raw;
    if (pageUrl) {
      try {
        absolute = new URL(raw, pageUrl).toString();
      } catch {
        /* Leave it as found; the caller validates before fetching anyway. */
      }
    }
    out.logoUrl = { value: absolute, source: ldLogo ? "schema.org logo" : "og:image" };
  }

  /* ── opening hours ────────────────────────────────────────────────── */
  const spec = biz?.openingHoursSpecification;
  if (Array.isArray(spec)) {
    const hours: Record<string, string> = {};
    for (const entry of spec as Array<Record<string, unknown>>) {
      const days = Array.isArray(entry.dayOfWeek) ? entry.dayOfWeek : [entry.dayOfWeek];
      const opens = clean(entry.opens);
      const closes = clean(entry.closes);
      if (!opens || !closes) continue;
      for (const d of days) {
        const day = clean(d).replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
        if (day) hours[day] = `${opens}–${closes}`;
      }
    }
    if (Object.keys(hours).length) {
      out.hours = { value: hours, source: "schema.org openingHoursSpecification" };
    }
  }

  return out;
}

/** The page's visible text, for the fields no structured field describes. */
export function pageText(html: string, limit = 12_000): string {
  const root = parse(html);
  for (const el of root.querySelectorAll("script, style, noscript, svg")) el.remove();
  return (root.querySelector("main") ?? root.querySelector("body") ?? root)
    .textContent.replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
