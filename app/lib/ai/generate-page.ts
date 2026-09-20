import { GoogleGenAI } from "@google/genai";
import type { PlannedSection } from "@/lib/sections/page-plan";
import { isOptionField, type FieldSpec } from "@/lib/sections/types";
import { describeBusiness, contactFactsFor, type BusinessContext } from "./business-context";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";

const MODEL = "gemini-2.5-flash";

/**
 * Writes copy for a whole page in one call.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ONE CALL AND NOT ONE PER SECTION
 *
 * A page has to hold together: the hero should not promise "same-day delivery"
 * while the FAQ says orders take three days, and the CTA should echo the offer
 * the hero made. Six independent calls cannot do that — each one is blind to
 * the others. One call sees the whole page and writes it as a piece.
 *
 * It is also six times fewer round trips, which is the difference between a
 * page appearing in seconds and the user watching a spinner.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EACH SECTION SHIPS ITS OWN SAMPLE AS THE SHAPE
 *
 * The prompt shows the model each section's real `sample` and asks for the same
 * shape back. Describing the field types in prose instead would be a second
 * description of a structure that already exists in code, free to drift from
 * it; the sample cannot drift, because it is what the previews and the tests
 * already render.
 *
 * The cost is that a lazy model may echo the sample. That is caught on the way
 * back in: a section whose copy still matches its sample is dropped rather than
 * published, because sample content is about a fictional florist.
 * ─────────────────────────────────────────────────────────────────────
 */

export type GeneratedSections = Record<string, Record<string, unknown>>;

export async function generatePageWithGemini(opts: {
  apiKey: string;
  plan: PlannedSection[];
  business: BusinessContext;
  instruction: string;
  pageTitle: string;
}): Promise<GeneratedSections> {
  const { apiKey, plan, business, instruction, pageTitle } = opts;
  const ai = new GoogleGenAI({ apiKey });

  /*
   * Tell the model which contact details exist.
   *
   * Without this it writes copy that leans on fields it assumes it will fill —
   * a bakery's contact section opened "Find us here:" and then, obeying the
   * no-inventing rule, left the address blank. The sentence dangled. The model
   * has to know what is available BEFORE it writes, not just what it may not
   * make up.
   */
  const facts = contactFactsFor(business);
  const known = Object.keys(facts);
  const contactRule = known.length
    ? `The only contact details on record are: ${known.join(", ")}. These will be filled in for you — write copy that works alongside them, and do not refer to any other contact detail.`
    : "NO contact details are on record — no phone, no address, no email, no opening hours. Do not write copy that points at one. Sentences like \"Find us here:\", \"Call us on\" or \"Open until\" must not appear, because nothing will follow them. Invite the reader to get in touch in a way that stands on its own.";

  const sectionBriefs = plan
    .map(({ job, section }) => {
      const def = section.definition;
      return [
        `### "${section.key}"  — ${job}`,
        section.aiPrompt,
        `Field guide: ${describeFields(def.fields)}`,
        `Return an object of exactly this shape (this example is for an unrelated business — copy the STRUCTURE, never the words):`,
        "```json",
        JSON.stringify(def.sample, null, 2),
        "```",
      ].join("\n");
    })
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are writing the "${pageTitle}" page of a real small business website.

## The business

${describeBusiness(business)}

## What the site owner asked for

"${instruction}"

Treat that as an instruction about the page, NOT as a description of the
business. If it says something generic like "build home page", it is simply
asking you to write this page for the business described above.

## Rules

- Write for THIS business and this trade. Never write about websites, website
  builders, templates or "getting online" unless the business above genuinely
  sells those things.
- Never invent verifiable facts: no prices, no phone numbers, no email
  addresses, no street addresses, no years in business, no awards, no customer
  counts, no opening hours. Where a field needs one and none was given above,
  leave it as an empty string. A published price the owner did not agree to is
  one they may have to honour.
- ${contactRule}
- Testimonials must read as plausible but must not name real people or real
  companies. Use first names and an initial.
- Respect the length hints. Copy that overflows breaks the layout.
- British English.
- Sections must agree with each other: one offer, one tone, no contradictions.

## Sections to write

${sectionBriefs}

## Output

Return ONLY a JSON object whose keys are exactly these section keys:
${plan.map((p) => `"${p.section.key}"`).join(", ")}
Each value is that section's object, in the shape shown. No commentary.`,
    config: {
      responseMimeType: "application/json",
      abortSignal: modelDeadline(),
    },
  });
  await captureUsage(response, MODEL);

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini response was not a JSON object.");
  }

  const out: GeneratedSections = {};
  for (const { section } of plan) {
    const value = (parsed as Record<string, unknown>)[section.key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[section.key] = value as Record<string, unknown>;
    }
  }

  if (Object.keys(out).length === 0) {
    throw new Error("Gemini returned no usable sections.");
  }
  return out;
}

/**
 * The field list as one line, so the model knows which keys are lists and how
 * long each string may be. Derived from `fields` rather than written out, for
 * the same reason the sample is used for shape: one source of truth.
 */
function describeFields(fields: Record<string, FieldSpec>): string {
  return Object.entries(fields)
    // Settings are not copy. Describing `sticky` to a copywriter invites it to
    // be answered in words rather than left alone.
    .filter(([, spec]) => !isOptionField(spec))
    .map(([name, spec]) => {
      const hint = spec.hint ? ` (${spec.hint})` : "";
      return `${name}: ${describeSpec(spec)}${hint}`;
    })
    .join("; ");
}

/**
 * One field's shape, nested lists included.
 *
 * `of` used to forbid nesting, so a price group's rows were declared `text`
 * and described to the model as a string — while the sample beside it showed
 * an array. Now that they can be declared truthfully, this has to say so, or
 * the model is told two different things in the same prompt.
 */
function describeSpec(spec: FieldSpec): string {
  const limit = spec.maxChars ? ` ≤${spec.maxChars} chars` : "";
  if (spec.type !== "list") return `${spec.type}${limit}`;
  if (!spec.of) return "list of short lines";
  const inner = Object.entries(spec.of)
    .map(([key, sub]) => (sub.type === "list" ? `${key}: ${describeSpec(sub)}` : key))
    .join(", ");
  return `list of { ${inner} }`;
}
