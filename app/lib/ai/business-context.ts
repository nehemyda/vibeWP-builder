import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, businessProfiles } from "@/lib/db/schema";
import { parseHours, parseServices, formatHours, type OpeningHours } from "@/lib/business/hours";

/**
 * What the AI is told about the business whose site it is writing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Generation used to receive one string: whatever the user typed in the chat.
 * That string was then handed to the model as the business description:
 *
 *     Business description from the customer: "build home page"
 *
 * So a site called "Sunrise Bakery Test" got a hero headlined "Launch Your
 * Perfect Homepage in Minutes. No Coding Required." — the model wrote perfectly
 * good copy for the business it had been told about, which was a website
 * builder. The bakery's own name was sitting in the database, unused.
 *
 * The instruction and the business are two different things and are now passed
 * separately: this describes WHO the site is for, the instruction says WHAT to
 * do about it.
 * ─────────────────────────────────────────────────────────────────────
 */
export type BusinessContext = {
  businessName: string;
  categories: string | null;
  tags: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  postcode: string | null;
  website: string | null;
  /** The owner's own description — the single most useful input generation gets. */
  about: string | null;
  /** Authoritative service names. Generation describes these and adds none. */
  services: string[];
  seoKeywords: string | null;
  hours: OpeningHours | null;
  /** Data URL, or null. */
  logoUrl: string | null;
};

export async function loadBusinessContext(
  siteId: string,
  /*
   * The site row, when the caller already holds it.
   *
   * This fetched it unconditionally, which is right for a caller that has only
   * an id and wasteful for one that has just loaded the row — the builder page
   * had, so this single call cost two round trips where every other call on
   * that page cost one. Optional rather than required: most callers genuinely
   * only know the id, and making them fetch it first would move the same waste
   * somewhere less visible.
   */
  opts?: { site?: { name: string } | null },
): Promise<BusinessContext | null> {
  /*
   * The two queries go together, because they never depended on each other —
   * only on the id. Passing `site` in drops the first entirely.
   */
  const [site, profile] = await Promise.all([
    opts?.site !== undefined
      ? Promise.resolve(opts.site)
      : db.query.sites.findFirst({ where: eq(sites.id, siteId) }),
    db.query.businessProfiles.findFirst({ where: eq(businessProfiles.ownerId, siteId) }),
  ]);
  if (!site) return null;

  const clean = (v: string | null | undefined) => {
    const t = v?.trim();
    return t && t.length > 0 ? t : null;
  };

  return {
    businessName: site.name,
    categories: clean(profile?.businessCategories),
    tags: clean(profile?.tags),
    city: clean(profile?.city),
    state: clean(profile?.state),
    country: clean(profile?.country),
    phone: clean(profile?.phoneNumber),
    email: clean(profile?.email),
    street: clean(profile?.address),
    postcode: clean(profile?.zip),
    website: clean(profile?.websiteAddress),
    about: clean(profile?.aboutText),
    services: parseServices(profile?.services).map((s) => s.name),
    seoKeywords: clean(profile?.seoKeywords),
    hours: parseHours(profile?.openingHours),
    logoUrl: clean(profile?.logoUrl),
  };
}

/**
 * The business, as prose for a prompt.
 *
 * Only states what is actually known. A field the client never filled in is
 * omitted rather than sent as "Category: null" or an invented guess — the
 * model treats anything in the prompt as fact, so a placeholder here becomes
 * a false claim on a published page.
 *
 * Most sites have nothing but a name, which is why the name has to carry the
 * inference. "Sunrise Bakery" is genuinely enough for a model to write bakery
 * copy; it just has to be told.
 */
export function describeBusiness(ctx: BusinessContext): string {
  const lines = [`Business name: ${ctx.businessName}`];
  if (ctx.categories) lines.push(`Type of business: ${ctx.categories}`);
  if (ctx.tags) lines.push(`Keywords: ${ctx.tags}`);

  const place = [ctx.city, ctx.state, ctx.country].filter(Boolean).join(", ");
  if (place) lines.push(`Location: ${place}`);
  if (ctx.website) lines.push(`Existing website: ${ctx.website}`);

  /*
   * The owner's own words outrank everything else here, so they go in whole.
   * Anything inferred from a business name is a guess; this is not.
   */
  if (ctx.about) lines.push(`\nWhat the owner says about the business:\n${ctx.about}`);

  /*
   * Services are a CLOSED list. Left open, the model reliably adds a plausible
   * extra — and a service on a website that the business does not offer is a
   * booking they have to turn away.
   */
  if (ctx.services.length) {
    lines.push(
      `\nServices offered — this list is COMPLETE and the names are FIXED.\n` +
        `Use each name exactly as written, word for word, as the heading. Do not\n` +
        `reword, expand, shorten or add adjectives to it, and do not add a service\n` +
        `that is not listed. Write the description underneath, not the name.\n` +
        ctx.services.map((s) => `- ${s}`).join("\n"),
    );
  }

  if (ctx.seoKeywords) {
    lines.push(
      `\nSearch terms customers use: ${ctx.seoKeywords}\n` +
        "Work these in where they read naturally. Never repeat them mechanically — " +
        "copy written for a search engine reads as written for a search engine.",
    );
  }

  if (!ctx.categories && !ctx.tags && !ctx.about) {
    lines.push(
      "No category was recorded for this business. Infer what it does from its " +
        "name and write for that trade. If the name is genuinely ambiguous, write " +
        "copy that would suit any local service business rather than guessing at " +
        "a specific trade.",
    );
  }

  return lines.join("\n");
}

/**
 * Contact details VibeWP actually holds for this business.
 *
 * These are FACTS, so they are written into the page after generation rather
 * than asked for in the prompt. The model is told never to invent a phone
 * number or address — correct, since an invented one is a real number
 * belonging to someone else — but that rule alone leaves the contact section
 * blank even for a client who filled the details in on their site record. This
 * closes that gap without ever letting the model near the values.
 */
export function contactFactsFor(ctx: BusinessContext): Record<string, string> {
  const facts: Record<string, string> = {};
  if (ctx.phone) facts.phone = ctx.phone;
  if (ctx.email) facts.email = ctx.email;

  const address = [ctx.street, ctx.city, ctx.state, ctx.postcode, ctx.country]
    .filter(Boolean)
    .join(", ");
  if (address) facts.address = address;

  // Formatted here rather than in each section, so every place hours appear
  // reads the same and the collapsing ("Monday to Friday") happens once.
  if (ctx.hours) facts.hours = formatHours(ctx.hours).join("\n");

  return facts;
}

/*
 * Fields the WordPress theme can resolve at render time, and the token each
 * one becomes. Anything not listed here is written as a literal value.
 */
const TOKENISED_FACTS: Record<string, string> = {
  phone: "{{phone}}",
  email: "{{email}}",
  address: "{{address}}",
  hours: "{{hours}}",
};

/**
 * Writes the details we hold over whatever was generated about them.
 *
 * A TOKEN, not the value. Writing "01225 447 812" into the page freezes it
 * there: change the number later and it has to be changed on the contact
 * section, the footer, and every other place it appears, on every page. The
 * token is resolved by the theme from a single option, so one edit in
 * Settings → Business details updates the whole site — which is the entire
 * reason the WordPress side has an options screen at all.
 *
 * ONLY WHERE THE FIELD CAN HOLD A STRING. This was written three times, in
 * generation, in swap_chrome and in add_section, and all three checked that
 * the section declared the field and nothing else. `hours` is a string in four
 * Contact sections and a list of day/time rows in two others, so a
 * contact-hours section reached the database with the string "{{hours}}" in a
 * list field and its renderer threw `(p.hours ?? []).filter is not a
 * function` — one dead section taking the whole page with it. Shared now, so
 * there is one place for that to be true.
 */
export function pinContactFacts(
  props: Record<string, unknown>,
  fields: Record<string, { type: string }>,
  facts: Record<string, string>,
): Record<string, unknown> {
  const out = { ...props };
  for (const field of Object.keys(facts)) {
    const spec = fields[field];
    if (!spec) continue;
    if (spec.type !== "text" && spec.type !== "richtext") continue;
    out[field] = TOKENISED_FACTS[field] ?? facts[field];
  }
  return out;
}

/**
 * A Pexels query for this business.
 *
 * Derived from the business, never from the instruction. The old code searched
 * on whatever was typed, so "build home page" returned a photograph of a
 * concrete building — technically a correct match for the words, and useless
 * on a bakery's homepage.
 */
export function photoQueryFor(ctx: BusinessContext): string {
  // The first service is the most specific true thing we know about the trade —
  // better than a category, and far better than a name that may be a pun.
  const subject =
    ctx.services[0] ?? ctx.categories ?? ctx.tags ?? stripQualifiers(ctx.businessName);
  return subject.split(/[,;]/)[0].trim() || "local business";
}

/**
 * Drops the parts of a site name that describe the record rather than the
 * trade, so "Sunrise Bakery Test" searches for a bakery and not for a test.
 */
function stripQualifiers(name: string): string {
  return (
    name
      .replace(/\b(test|testing|demo|sample|staging|dev|copy|draft|v\d+|\d+)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || name
  );
}
