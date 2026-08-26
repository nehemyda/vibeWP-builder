/**
 * A scripted stand-in for the real multi-agent pipeline described in
 * docs/architecture.md. It picks a canned HeroSplit-shaped content set based
 * on keywords in the user's prompt — there is no LLM call here. This exists
 * so the "start building" flow is genuinely demoable before the real AI
 * pipeline is built.
 */

export type HeroContent = {
  eyebrow: string;
  heading: string;
  body: string;
  primaryLabel: string;
  outlineLabel: string;
};

type Vertical = {
  match: RegExp;
  content: HeroContent;
};

const VERTICALS: Vertical[] = [
  {
    match: /plumb/i,
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
        },
      },
    ],
  };
}
