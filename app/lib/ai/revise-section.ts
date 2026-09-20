import { GoogleGenAI } from "@google/genai";
import type { ResolvedSection } from "@/lib/sections/resolve";
import { isOptionField, type FieldSpec } from "@/lib/sections/types";
import { describeBusiness, type BusinessContext } from "./business-context";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";

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
 * ─────────────────────────────────────────────────────────────────────
 */

export type Revision = {
  props: Record<string, unknown>;
  /** Field names that actually changed, in the order the section declares them. */
  changed: string[];
};

const isImage = (spec: FieldSpec) => spec.type === "image";

/** The section's copy only — no photographs, no settings. */
export function copyFields(fields: Record<string, FieldSpec>, props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(fields)) {
    if (isOptionField(spec) || isImage(spec)) continue;
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
    if (isOptionField(spec) || isImage(spec)) continue;
    const value = p[name];

    let next: unknown;
    if (spec.type === "list") {
      if (!Array.isArray(value)) continue;
      const before = Array.isArray(current[name]) ? (current[name] as unknown[]) : [];
      const imageKeys = spec.of ? Object.entries(spec.of).filter(([, s]) => isImage(s)).map(([k]) => k) : [];
      next = value.map((item, i) => {
        if (!spec.of) return typeof item === "string" ? item : String(item ?? "");
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const entry = { ...(item as Record<string, unknown>) };
        const was = before[i];
        for (const k of imageKeys) {
          if (was && typeof was === "object" && k in (was as Record<string, unknown>)) {
            entry[k] = (was as Record<string, unknown>)[k];
          }
        }
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
  const def = section.definition;
  const ai = new GoogleGenAI({ apiKey });

  const shown = copyFields(def.fields, current);
  const guide = Object.entries(def.fields)
    .filter(([, spec]) => !isOptionField(spec) && !isImage(spec))
    .map(([name, spec]) => `${name} — ${spec.label}${spec.maxChars ? `, up to ${spec.maxChars} characters` : ""}${spec.hint ? ` (${spec.hint})` : ""}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are making ONE requested change to a section of the "${pageTitle}" page of a real small business website. The section is the "${section.name}".

## The business

${describeBusiness(business)}

## The section as it stands

\`\`\`json
${JSON.stringify(shown, null, 2)}
\`\`\`

Fields:
${guide}

## What the site owner asked for

"${instruction}"

## Rules

- Change ONLY what was asked. If they named a button, change that button and
  nothing else. If they asked for a different headline, change the headline
  and nothing else. A client who asks for one word changed and gets a new
  section has lost work they may have chosen.
- Return ONLY the fields you changed, as a JSON object using the field names
  above. Leave every other field out entirely. An empty object {} is the
  correct answer if the request cannot be carried out in this section.
- A list must be returned whole, with every entry, in order — changed or not.
- Keep each value within its length. British English. Never invent
  verifiable facts: no prices, phone numbers, addresses, years, awards or
  customer counts that are not in the business details above.
- Match the tone of the words already there.

Return only the JSON object.`,
    config: {
      responseMimeType: "application/json",
      abortSignal: modelDeadline(),
    },
  });
  await captureUsage(response, MODEL);

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return applyRevision(def.fields, current, JSON.parse(text));
}
