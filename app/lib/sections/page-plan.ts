import type { ResolvedSection } from "./resolve";

/**
 * Which sections a page is made of.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Generation could only ever produce one node. heroContentToSchema() built
 * `nodes: [ { type: "HeroSplit" } ]` — literally hardcoded — so "build home
 * page" produced a hero and stopped. The library grew to 56 sections while
 * exactly one of them was reachable, which is the gap this closes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE PLAN IS CODE, NOT AI
 *
 * The model writes the COPY; the plan decides the STRUCTURE. Asking the model
 * to also choose sections would make the same prompt produce a different page
 * shape each run, which is impossible to support ("why did my services section
 * disappear?") and impossible to test. A deterministic plan means a given
 * business always gets the same skeleton, and a regression is reproducible.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THESE DEFAULTS
 *
 * One section per job, in the order a visitor reads: what you are → what you
 * sell → why trust you → what you'll be asked → the ask → how to reach you.
 *
 * Defaults deliberately favour sections that need NO photograph. Each image is
 * a stock search whose subject we cannot verify, and a wrong photo is more
 * damaging than no photo — so only the hero gets one, and the services slot
 * defaults to the editorial rows rather than the photo cards.
 */

/** A slot on the page, filled by the first available candidate. */
type Slot = {
  /** Why this slot exists — surfaced to the user as the build step. */
  job: string;
  /** Preferred section keys, best first. */
  candidates: string[];
  /** When true, the page is still valid if nothing fills it. */
  optional?: boolean;
};

const HOME: Slot[] = [
  { job: "Opening pitch", candidates: ["hero-split", "hero-showcase", "hero-centered", "hero-banner"] },
  {
    job: "What you sell",
    // Editorial rows first: no images, and it reads as designed rather than as
    // a grid of boxes. features-grid is the long-standing fallback.
    candidates: ["services-editorial", "features-grid", "services-featured", "content-alternating"],
  },
  { job: "Why trust you", candidates: ["testimonials", "conversion-logos", "content-stats"] },
  { job: "Common questions", candidates: ["faq", "faq-two-column", "faq-open"], optional: true },
  { job: "The ask", candidates: ["cta-band", "cta-split", "cta-boxed"] },
  { job: "How to reach you", candidates: ["contact-block", "contact-cards", "contact-band"] },
];

/**
 * An inner page gets a lighter skeleton: it is reached from the home page, so
 * it does not need to re-establish trust or repeat the contact details.
 */
const INNER: Slot[] = [
  { job: "Page opening", candidates: ["hero-centered", "hero-split", "hero-banner"] },
  {
    job: "The detail",
    candidates: ["content-alternating", "services-editorial", "features-grid", "content-checklist"],
  },
  { job: "The ask", candidates: ["cta-band", "cta-split"] },
];

/**
 * A contact page, which had no plan of its own.
 *
 * It fell through to INNER and came out as a hero, a block of prose and a
 * call-to-action — a page inviting people to get in touch with nothing to get
 * in touch through. The form is the point of the page, so it is a required
 * slot, and the details sit beside it for anyone who would rather phone.
 */
const CONTACT: Slot[] = [
  { job: "Page opening", candidates: ["hero-centered"] },
  { job: "The form", candidates: ["form-embed"] },
  { job: "Other ways to reach you", candidates: ["contact-block", "contact-cards", "contact-band"] },
];

/** A services page is the one place the photo-led and price layouts belong. */
const SERVICES: Slot[] = [
  { job: "Page opening", candidates: ["hero-centered", "hero-split"] },
  { job: "The services", candidates: ["services-editorial", "features-grid"] },
  { job: "Prices", candidates: ["services-pricelist"], optional: true },
  { job: "Common questions", candidates: ["faq", "faq-two-column"], optional: true },
  { job: "The ask", candidates: ["cta-band", "cta-split"] },
];

/**
 * The site's header and footer.
 *
 * Chosen once, when the home page is first built, and then left alone: these
 * are template parts, so re-picking them on every generation would silently
 * change the navigation on every page of the site because someone regenerated
 * the About page.
 *
 * The footer default is the columns layout rather than the minimal one — it is
 * the only footer with room for contact details and links, which is what a real
 * site's footer is for.
 */
const CHROME: Slot[] = [
  { job: "Site header", candidates: ["header-simple", "header-cta", "header-centered", "header-minimal"] },
  { job: "Site footer", candidates: ["footer-columns", "footer-contact", "footer-simple", "footer-social"] },
];

export function planChrome(available: ResolvedSection[]): PlannedSection[] {
  const byKey = new Map(available.map((s) => [s.key, s]));
  const out: PlannedSection[] = [];

  for (const slot of CHROME) {
    const pick = slot.candidates
      .map((k) => byKey.get(k))
      .find((s): s is ResolvedSection => Boolean(s));
    if (pick) out.push({ job: slot.job, section: pick });
  }
  return out;
}

function slotsFor(slug: string): Slot[] {
  if (slug === "home") return HOME;
  if (/^(services|our-services|what-we-do|treatments|pricing|prices)$/.test(slug)) return SERVICES;
  /*
   * The names people actually give a page whose point is a form.
   *
   * "quote" was missing, so "create a quote page and add a quote form" produced
   * a hero, some prose and a call to action — a page for requesting a quote
   * with no way to request one.
   */
  if (
    /^(contact|contact-us|get-in-touch|enquiries|enquiry|book|booking|quote|quotes|get-a-quote|request-a-quote|estimate|consultation|appointment)$/.test(
      slug,
    )
  ) {
    return CONTACT;
  }
  return INNER;
}

export type PlannedSection = { job: string; section: ResolvedSection };

/**
 * Resolves a page's slots against what this site may actually use.
 *
 * `available` is already filtered by isActive and the site's plan, so an admin
 * switching a section off in /admin/sections takes it out of generation without
 * a deploy — and the slot falls through to its next candidate rather than
 * leaving a hole.
 */
/**
 * Does the client's own sentence ask for a form?
 *
 * The slug list will always be incomplete — "Request a callback", "Start your
 * order", "Work with us" all want a form and none of them match. What someone
 * TYPED is better evidence than what we guessed their page should be called,
 * so an explicit request wins regardless of the slug.
 */
function instructionWantsForm(instruction?: string): boolean {
  return /\b(form|enquir|enquiry|quote|contact us|get in touch|book|booking|request)\b/i.test(
    instruction ?? "",
  );
}

export function planPage(
  slug: string,
  available: ResolvedSection[],
  /** What the client actually asked for, when a page is made from a sentence. */
  instruction?: string,
): PlannedSection[] {
  const byKey = new Map(available.map((s) => [s.key, s]));
  const used = new Set<string>();
  const out: PlannedSection[] = [];

  const slots = [...slotsFor(slug)];

  /*
   * Asked for a form on a page whose plan has none — add one before the closing
   * ask, where a form belongs. Without this the request was silently ignored:
   * the page was built, reported as three sections, and contained nothing to
   * fill in.
   */
  const hasFormSlot = slots.some((slot) => slot.candidates.includes("form-embed"));
  if (!hasFormSlot && instructionWantsForm(instruction)) {
    const lastIndex = slots.length > 1 ? slots.length - 1 : slots.length;
    slots.splice(lastIndex, 0, { job: "The form", candidates: ["form-embed"] });
  }

  for (const slot of slots) {
    const pick = slot.candidates
      .map((k) => byKey.get(k))
      .find((s): s is ResolvedSection => Boolean(s) && !used.has(s!.key));

    if (pick) {
      used.add(pick.key);
      out.push({ job: slot.job, section: pick });
      continue;
    }

    /*
     * Nothing preferred is available. For a required slot, fall back to any
     * active section in the right category rather than shipping a page with
     * no way to contact the business — a plan that silently drops its contact
     * details is worse than one that uses a layout we did not first choose.
     */
    if (!slot.optional) {
      const category = categoryOfFirstCandidate(slot, available);
      const substitute = available.find((s) => s.category === category && !used.has(s.key));
      if (substitute) {
        used.add(substitute.key);
        out.push({ job: slot.job, section: substitute });
      }
    }
  }

  return out;
}


/**
 * The plan a page was already built from, read back off the page itself.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A CLONE IS A PLAN AND NOT A COPY
 *
 * Duplicating a site by copying its pages produces a plumber's website that
 * says "long-fermented sourdough, baked from 4 AM on Market Street, Bath". It
 * is wrong in every sentence, and it looks finished — which is worse than a
 * blank page, and is the same fabrication the generator's own rules forbid:
 * no invented addresses, no invented opening hours, no testimonials attributed
 * to people who never said them.
 *
 * What is genuinely reusable about a good site is not its words. It is which
 * sections, in which order, doing which job — the decisions an agency actually
 * repeats from client to client. That is a PlannedSection[], which is exactly
 * what the generator already takes.
 *
 * So a clone lifts the plan and runs it against the new business. The copy is
 * written for that business, and so are the photographs: fillSectionImages
 * searches on photoQueryFor(business), which reads the client's first service.
 * Nothing of the source's content travels.
 *
 * WHY THE JOB IS MATCHED TO THE SECTION AND NOT TO ITS POSITION
 *
 * `job` is the brief a section is generated against ("The opening", "The
 * ask"), and it is not stored on the node — nothing needed it after
 * generation. The slug's own slots carry that vocabulary, so it is recovered
 * from there.
 *
 * By SECTION, though, never by position. Position only lines up while a page
 * still matches the canonical plan for its slug, and a page anyone has edited
 * does not. Measured on a real edited homepage, positional matching briefed
 * "Common questions" onto a testimonials section and "The ask" onto an FAQ —
 * every job one slot out, each one a small lie told to the generator about
 * what it was writing.
 *
 * A section that fills no known slot takes its own name, which reads correctly
 * in a prompt: "Embed", "Gallery".
 * ─────────────────────────────────────────────────────────────────────
 */
export function planFromSchema(
  schema: unknown,
  available: ResolvedSection[],
  /** The page's slug, used only to recover the job each slot describes. */
  slug = "home",
): PlannedSection[] {
  const nodes = (schema as { nodes?: Array<{ type?: string }> } | null)?.nodes;
  if (!Array.isArray(nodes)) return [];

  const byNodeType = new Map(available.map((s) => [s.nodeType, s]));

  /* The job each slot would give a section, keyed by the section it asks for. */
  const jobForKey = new Map<string, string>();
  for (const slot of slotsFor(slug)) {
    for (const candidate of slot.candidates) {
      if (!jobForKey.has(candidate)) jobForKey.set(candidate, slot.job);
    }
  }

  const out: PlannedSection[] = [];
  for (const node of nodes) {
    const section = byNodeType.get(node.type ?? "");

    /*
     * Silently skipped, and that is correct. `available` is already filtered
     * by isActive and the target site's plan, so a section the source site may
     * use and the new one may not simply does not appear — the same way a slot
     * falls through in planPage rather than leaving a hole. Copying it would
     * put a section on a site whose plan does not permit it.
     */
    if (!section) continue;

    out.push({ job: jobForKey.get(section.key) ?? section.name, section });
  }

  return out;
}

/**
 * The category a slot is really asking for, read off its own first choice so
 * the two can never disagree — hardcoding "hero-split means Hero" here would
 * be a second source of truth to keep in sync.
 */
function categoryOfFirstCandidate(slot: Slot, available: ResolvedSection[]): string | undefined {
  for (const key of slot.candidates) {
    const found = available.find((s) => s.key === key);
    if (found) return found.category;
  }
  return undefined;
}
