/**
 * A scripted stand-in for the real multi-agent pipeline described in
 * docs/architecture.md. It picks a canned HeroSplit-shaped content set based
 * on keywords in the user's prompt — there is no LLM call here. This exists
 * so the "start building" flow is genuinely demoable before the real AI
 * pipeline is built.
 */

export type HeroImage = {
  url: string;
  alt: string;
  photographer?: string;
  photographerUrl?: string;
};

export type HeroContent = {
  eyebrow: string;
  heading: string;
  body: string;
  primaryLabel: string;
  outlineLabel: string;
  /** Null when no photo could be sourced; the hero then renders copy-only. */
  image?: HeroImage | null;
};

type Vertical = {
  match: RegExp;
  /** Pexels search terms. Concrete and photographable beats abstract — "dentist
   *  examining patient" returns usable frames where "dental care" returns
   *  toothbrush stock and logos. */
  imageQuery: string;
  content: HeroContent;
};

const VERTICALS: Vertical[] = [
  {
    match: /plumb/i,
    imageQuery: "plumber working pipes",
    content: {
      eyebrow: "24/7 LIVE DISPATCH",
      heading: "Rapid Emergency Repairs & Precision Plumbing Installation",
      body: "Licensed master technicians with transparent upfront pricing and guaranteed code compliance.",
      primaryLabel: "Call Now",
      outlineLabel: "Request a Quote",
    },
  },
  {
    match: /law|attorney|legal/i,
    imageQuery: "lawyer office meeting",
    content: {
      eyebrow: "FREE CASE EVALUATION",
      heading: "Trial-Tested Counsel When It Matters Most",
      body: "Decades of courtroom experience representing clients against insurers who don't want to pay.",
      primaryLabel: "Get a Free Consultation",
      outlineLabel: "See Case Results",
    },
  },
  {
    match: /dent(al|ist)/i,
    imageQuery: "dentist examining patient",
    content: {
      eyebrow: "NEW PATIENTS WELCOME",
      heading: "Friendly, Modern Dental Care for the Whole Family",
      body: "Same-week appointments, gentle hygienists, and painless checkups your kids won't dread.",
      primaryLabel: "Book an Appointment",
      outlineLabel: "View Services",
    },
  },
  {
    match: /bak(e|ery)|caf(e|é)|coffee/i,
    imageQuery: "artisan bakery bread counter",
    content: {
      eyebrow: "FRESH DAILY",
      heading: "Small-Batch Baking, Done Right",
      body: "Order ahead for pickup, or stop by the counter — we sell out most afternoons.",
      primaryLabel: "Order Ahead",
      outlineLabel: "View Menu",
    },
  },
  {
    match: /auto|detail|mechanic|car\s?repair/i,
    imageQuery: "car detailing polishing",
    content: {
      eyebrow: "MOBILE SERVICE AVAILABLE",
      heading: "Showroom-Quality Work, At Your Driveway",
      body: "Booked in under two minutes, with upfront pricing and no surprise fees.",
      primaryLabel: "Get a Quote",
      outlineLabel: "See Packages",
    },
  },
];

function extractBusinessPhrase(prompt: string): string {
  const match = prompt.match(/for (?:my |a |an )?(.+)$/i);
  const phrase = (match ? match[1] : prompt).replace(/[.?!]+$/, "").trim();
  return phrase || "your business";
}

export function generateHeroContent(prompt: string): HeroContent {
  const vertical = VERTICALS.find((v) => v.match.test(prompt));
  if (vertical) return vertical.content;

  const phrase = extractBusinessPhrase(prompt);
  return {
    eyebrow: "NOW BOOKING",
    heading: `Everything ${phrase} needs to look world-class online`,
    body: `A site built around what ${phrase} actually does — fast to launch, and yours to keep forever.`,
    primaryLabel: "Get Started",
    outlineLabel: "Learn More",
  };
}

/**
 * Search terms for the hero photo. A matched vertical supplies a curated,
 * photographable phrase; anything else falls back to the business phrase from
 * the prompt, which is at least on-topic.
 */
export function heroImageQuery(prompt: string): string {
  const vertical = VERTICALS.find((v) => v.match.test(prompt));
  if (vertical) return vertical.imageQuery;
  return extractBusinessPhrase(prompt);
}

export function heroContentToSchema(content: HeroContent) {
  return {
    schemaVersion: "1.0",
    nodes: [
      {
        id: "n_hero",
        kind: "react",
        type: "HeroSplit",
        props: {
          eyebrow: content.eyebrow,
          heading: content.heading,
          body: content.body,
          actions: [
            { label: content.primaryLabel, href: "#", variant: "primary" },
            { label: content.outlineLabel, href: "#", variant: "outline" },
          ],
          // Omitted entirely when absent, so a copy-only hero round-trips
          // through the schema unchanged.
          ...(content.image ? { image: content.image } : {}),
        },
      },
    ],
  };
}
