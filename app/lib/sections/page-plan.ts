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
export function planPage(slug: string, available: ResolvedSection[]): PlannedSection[] {
  const byKey = new Map(available.map((s) => [s.key, s]));
  const used = new Set<string>();
  const out: PlannedSection[] = [];

  for (const slot of slotsFor(slug)) {
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
