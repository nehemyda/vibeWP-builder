import type { FieldSpec } from "@/lib/sections/types";
import { formatHours } from "@/lib/business/hours";
import type { BusinessContext } from "./business-context";

/**
 * Figures the model produced, checked against figures the client supplied.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A GUARD AND NOT A BETTER SENTENCE IN THE PROMPT
 *
 * The prompt already forbade this. generate-page.ts says "no years in
 * business, no awards, no customer counts", and a homepage still shipped
 * "1000+ Happy Smiles" and "50+ Emergencies Monthly" for a dentist who had
 * told us neither. The stats sections' own prompts asked for it — "if the
 * true numbers are unknown use round placeholders the client will obviously
 * correct" — and their samples showed it: 500+ Weddings, 14 yrs, 4.9★.
 *
 * Those prompts are fixed. But a rule the model is asked to follow is not a
 * control, and a round number is not "obviously a placeholder" to a visitor:
 * it reads as a claim, and a client who does not notice publishes it. So
 * this is mechanical, in the same place and the same spirit as
 * pinContactFacts — facts we hold beat text we generated. A figure stands
 * only if the client wrote it down somewhere: their about text, a service, a
 * category, their opening hours. "4 AM" survives for a bakery that opens at
 * 04:00. "1000+" survives only for a business that said 1000.
 *
 * WHAT IT DOES NOT TOUCH
 *
 * Prose. "Open from 4 AM" in a paragraph is left alone — scrubbing digits
 * from sentences would be blunt, and phone numbers and addresses are pinned
 * separately. Only stat rows, the value/label pairs sections render as big
 * figures, because a big figure is exactly where an invented number does the
 * most damage and where a person is least likely to read it critically.
 * ─────────────────────────────────────────────────────────────────────
 */

/** "1,000+" and "1000" are one figure; "04" and "4" are one figure; "4.9" is its own. */
const NUMBER = /\d+(?:\.\d+)?/g;
const normalise = (n: string) => (n.includes(".") ? n : String(parseInt(n, 10)));
const numbersIn = (text: string): string[] => (text.replace(/,/g, "").match(NUMBER) ?? []).map(normalise);

/** Every figure the client has themselves written down. */
export function clientSaidNumbers(business: BusinessContext): Set<string> {
  const corpus = [
    business.businessName,
    business.about ?? "",
    business.categories ?? "",
    business.tags ?? "",
    ...business.services,
    ...(business.hours ? formatHours(business.hours) : []),
    /* The COUNT of what the client listed is a fact they supplied. Without
       this, "2 core services" for a business that listed two was dropped as
       invented — measured, against the real model. */
    business.services.length ? String(business.services.length) : "",
  ].join("\n");
  return new Set(numbersIn(corpus));
}

/**
 * A list whose rows are a FIGURE and what it counts.
 *
 * Shape alone is not enough. contact-cards and contact-band are also lists of
 * value/label rows — "01225 447 811 / Phone", "12 Market Street / Visit" —
 * and a shape-only rule caught them, which at generation time would have
 * stripped a client's real, pinned phone number for having digits nobody
 * "said". The gate caught that before it shipped. "stats" is the registry's
 * own word for figures, and every stats section names its field that; a
 * contact list does not. So the name is the discriminator, with the shape as
 * a check that the name is not lying.
 */
export function isStatList(name: string, spec: FieldSpec | undefined): boolean {
  const figures = name === "stats" || /\b(stats?|figures?)\b/i.test(spec?.label ?? "");
  return (
    figures &&
    spec?.type === "list" &&
    spec.of?.value?.type === "text" &&
    spec.of?.label?.type === "text"
  );
}

type StatRow = { value?: unknown; label?: unknown };

export function stripUnsupportedStats(
  props: Record<string, unknown>,
  fields: Record<string, FieldSpec>,
  business: BusinessContext,
): { props: Record<string, unknown>; stripped: string[] } {
  const said = clientSaidNumbers(business);
  const out = { ...props };
  const stripped: string[] = [];

  for (const [field, spec] of Object.entries(fields)) {
    if (!isStatList(field, spec)) continue;
    const rows = out[field];
    if (!Array.isArray(rows)) continue;

    out[field] = (rows as StatRow[]).filter((row) => {
      const value = typeof row?.value === "string" ? row.value : "";
      const figures = numbersIn(value);
      /* No digits — "Bristol", "Mon–Sat", "Same day" — is not a claim of
         quantity, and is kept. */
      if (figures.length === 0) return true;
      if (figures.every((n) => said.has(n))) return true;
      stripped.push(`${value} ${typeof row?.label === "string" ? row.label : ""}`.trim());
      return false;
    });
  }

  return { props: out, stripped };
}
