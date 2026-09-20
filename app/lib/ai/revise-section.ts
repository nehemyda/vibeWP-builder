import { GoogleGenAI } from "@google/genai";
import type { ResolvedSection } from "@/lib/sections/resolve";
import { isOptionField, type FieldSpec } from "@/lib/sections/types";
import type { BusinessContext } from "./business-context";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";
import { SHARED_FIELD_KEYS } from "./plan-prompt";

const MODEL = "gemini-2.5-flash";

/**
 * Changing the words in one section, without changing the others.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A PATCH AND NOT A REWRITE
 *
 * "Change the first button to say See Today's Loaves" used to hand the hero to
 * the page writer as a section to WRITE, with that sentence as the brief. It
 * came back with a new headline, new body copy and new feature lines — good
 * ones — and the one thing the client asked for. They lost a headline they may
 * have chosen, to change a button.
 *
 * So the model is shown the section as it stands and asked for ONLY the fields
 * it changed. Everything it does not return is kept, mechanically, in
 * `applyRevision` — which also refuses fields that do not exist, values of the
 * wrong shape, and anything that is a photograph or a setting. The prompt asks
 * for restraint; the merge guarantees the parts of it that can be guaranteed.
 *
 * WHY PHOTOS AND SETTINGS ARE NOT EVEN SHOWN
 *
 * A model that sees an image URL may "improve" it, and a client who asked for
 * different words did not ask for a different picture. Options (columns,
 * sticky, background) are the same: they are chosen in the panel, not written.
 * Both are stripped before the model sees the section and restored after.
 *
 * WHY THE PROMPT IS SMALL AND THE MODEL DOES NOT "THINK"
 *
 * Changing a label is not a reasoning problem. The full business brief —
 * the owner's paragraph, the closed services list with its rules about
 * headings — is what a page WRITER needs; a reviser needs the name, the
 * trade, the town and the service names, as a guard against inventing, and
 * takes its tone from the words already in the section. The thinking budget
 * is zero for the same reason: on the old prompt the model spent up to 1,300
 * tokens deliberating over a button, and the answer was the same.
 * ─────────────────────────────────────────────────────────────────────
 */

/** One line about the business: enough to stop invention, not a brief. */
export function businessLine(b: BusinessContext): string {
  const parts = [b.businessName];
  if (b.categories) parts.push(b.categories);
  const place = [b.city, b.state, b.country].filter(Boolean).join(", ");
  if (place) parts.push(place);
  let line = parts.join(" — ");
  if (b.services.length) line += `. Services (the only ones offered): ${b.services.join("; ")}`;
  return line;
}

/** The copy fields, one line each: name, length, shape. */
export function fieldGuide(fields: Record<string, FieldSpec>): string {
  return Object.entries(fields)
    .filter(([name, spec]) => isCopy(name, spec))
    .map(([name, spec]) => {
      const limit = spec.maxChars ? ` ≤${spec.maxChars} chars` : "";
      if (spec.type !== "list") return `${name}: ${spec.label}${limit}`;
      const shape = spec.of
        ? `list of {${Object.entries(spec.of).filter(([, s]) => !isImage(s)).map(([k]) => k).join(", ")}}`
        : "list of short lines";
      return `${name}: ${spec.label}, ${shape}`;
    })
    .join("\n");
}

export function buildRevisionPrompt(opts: {
  section: ResolvedSection;
  current: Record<string, unknown>;
  business: BusinessContext;
  instruction: string;
  pageTitle: string;
}): string {
  const { section, current, business, instruction, pageTitle } = opts;
  const def = section.definition;
  return `Make ONE requested change to the "${section.name}" section of the "${pageTitle}" page of a small business website.

Business: ${businessLine(business)}

Section now (JSON):
${JSON.stringify(copyFields(def.fields, current))}

Fields:
${fieldGuide(def.fields)}

Request: "${instruction}"

Rules:
- Change ONLY what was asked. One button named means one button changed; a headline asked for means the headline and nothing else.
- Return ONLY the fields you changed, as JSON with the field names above. Leave every other field out. Return {} if the request cannot be done in this section.
- A list is returned whole, every entry in order, changed or not.
- Keep within each length. Match the tone of the words already there. British English.
- Never invent facts — no prices, phone numbers, addresses, years, awards or counts that are not in the business line above.

Return only the JSON object.`;
}

export type Revision = {
  props: Record<string, unknown>;
  /** Field names that actually changed, in the order the section declares them. */
  changed: string[];
};

const isImage = (spec: FieldSpec) => spec.type === "image";
/* Copy is what a client reads. Photos, settings and the shared style fields
   (partOrder is stored as text but is a layout, not a sentence) are not. */
const isCopy = (name: string, spec: FieldSpec) => !isOptionField(spec) && !isImage(spec) && !SHARED_FIELD_KEYS.has(name);

/** The section's copy only — no photographs, no settings. */
export function copyFields(fields: Record<string, FieldSpec>, props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(fields)) {
    if (!isCopy(name, spec)) continue;
    if (!(name in props)) continue;
    const value = props[name];
    if (spec.type === "list" && spec.of && Array.isArray(value)) {
      const imageKeys = Object.entries(spec.of).filter(([, s]) => isImage(s)).map(([k]) => k);
      out[name] = value.map((item) => {
        if (!item || typeof item !== "object") return item;
        const copy = { ...(item as Record<string, unknown>) };
        for (const k of imageKeys) delete copy[k];
        return copy;
      });
    } else {
      out[name] = value;
    }
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merges what the model returned onto what was there. Pure.
 *
 * Accepts a field only if the section declares it as copy and the value has
 * the declared shape. A list is replaced whole — a model cannot address "the
 * second entry" reliably — but each entry keeps the photograph it had at the
 * same position, since the model was never shown one to return.
 */
export function applyRevision(
  fields: Record<string, FieldSpec>,
  current: Record<string, unknown>,
  patch: unknown,
): Revision {
  const props = { ...current };
  const changed: string[] = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { props, changed };
  const p = patch as Record<string, unknown>;

  for (const [name, spec] of Object.entries(fields)) {
    if (!(name in p)) continue;
    if (!isCopy(name, spec)) continue;
    const value = p[name];

    let next: unknown;
    if (spec.type === "list") {
      if (!Array.isArray(value)) continue;
      const before = Array.isArray(current[name]) ? (current[name] as unknown[]) : [];
      const imageKeys = spec.of ? Object.entries(spec.of).filter(([, s]) => isImage(s)).map(([k]) => k) : [];
      next = value.map((item, i) => {
        if (!spec.of) return typeof item === "string" ? item : String(item ?? "");
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        /*
         * The entry that was there comes FIRST, the model's on top. The model
         * was shown copy only, so a button's "variant" or a card's photo is
         * something it never saw and cannot return; starting from the old
         * entry keeps them, and the photo is pinned back on regardless.
         */
        const was = before[i] && typeof before[i] === "object" ? (before[i] as Record<string, unknown>) : {};
        const entry: Record<string, unknown> = { ...was, ...(item as Record<string, unknown>) };
        for (const k of imageKeys) if (k in was) entry[k] = was[k];
        return entry;
      });
      if ((next as unknown[]).some((x) => x === null)) continue;
    } else {
      if (typeof value !== "string") continue;
      next = value;
    }

    if (sameValue(next, current[name])) continue;
    props[name] = next;
    changed.push(name);
  }

  return { props, changed };
}

export async function reviseSectionWithGemini(opts: {
  apiKey: string;
  section: ResolvedSection;
  current: Record<string, unknown>;
  business: BusinessContext;
  instruction: string;
  pageTitle: string;
}): Promise<Revision> {
  const { apiKey, section, current, business, instruction, pageTitle } = opts;
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildRevisionPrompt({ section, current, business, instruction, pageTitle }),
    config: {
      responseMimeType: "application/json",
      /* A label change is not a reasoning task; see the note at the top. */
      thinkingConfig: { thinkingBudget: 0 },
      abortSignal: modelDeadline(),
    },
  });
  await captureUsage(response, MODEL);

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return applyRevision(section.definition.fields, current, JSON.parse(text));
}
