import { GoogleGenAI } from "@google/genai";
import { modelDeadline, modelFailureReason } from "@/lib/ai/deadline";

const MODEL = "gemini-2.5-flash";

/*
 * The fuzzy fields, over text that was already extracted — never over raw
 * HTML, and never as a replacement for what the structured reader already
 * found declared. structured.ts covers name, phone, email, address, hours:
 * fields with a place on the page whose MEANING was declared. Nothing here
 * changes that — this module exists for the two fields that have no such
 * place. Nobody marks up "services" or "about us" in a machine-readable way,
 * so the only way to recover them is to read the page the way a person would.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SAME RULE, APPLIED TO A LESS RELIABLE INSTRUMENT
 *
 * business-context.ts forbids inventing a phone number, a price, an award —
 * because an invented one belongs to somebody else. A model asked to guess at
 * a business's services from thin text can invent just as easily, in the
 * ordinary way models do: by filling a gap with something plausible instead
 * of admitting the gap. The prompt below says twice that an empty answer is a
 * correct answer, because the failure mode to design against is not "found
 * nothing" — it is "invented something that reads well".
 *
 * WHY THIS NEVER RUNS ON A GUESS ABOUT WHO THE BUSINESS IS
 *
 * The page text is what came back from readSite for the URL a person
 * actually pasted. There is no fallback to searching, no "if this fails, try
 * their Google listing" — an empty or unhelpful page yields an empty result,
 * not a plausible-sounding one from somewhere else.
 * ─────────────────────────────────────────────────────────────────────
 */

export type Enriched = {
  services: string[];
  about: string;
};

const EMPTY: Enriched = { services: [], about: "" };

function isEnriched(v: unknown): v is Enriched {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.services) &&
    o.services.every((s) => typeof s === "string") &&
    typeof o.about === "string"
  );
}

export async function enrichFromPageText(opts: {
  apiKey: string;
  pageText: string;
}): Promise<{ result: Enriched; error: string | null }> {
  const text = opts.pageText.trim();
  if (!text) return { result: EMPTY, error: null };

  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: `You are reading the text of a small business's own website — nothing else,
no outside knowledge of the business.

PAGE TEXT:
"""
${text.slice(0, 8000)}
"""

Extract two things, using ONLY what the text above actually says.

1. SERVICES — a short list of what this business offers, in plain terms. Look
   for a services list, a menu, or phrases like "we offer" or "specialising
   in". Do NOT list navigation labels (Home, About, Contact, Blog, Careers) as
   services. If the text does not clearly describe what the business offers,
   return an empty array. An empty array is a correct answer — it is not a
   failure, and a guessed list is worse than none.

2. ABOUT — two to three sentences summarising what the business is and does,
   using ONLY facts stated in the text above. Do not invent a founding year, an
   award, a customer count, or anything the text does not say. If the text
   does not describe the business well enough to summarise honestly, return an
   empty string. An empty string is a correct answer.

Return ONLY JSON of exactly this shape:
{"services": ["...", "..."], "about": "..."}`,
      config: {
        responseMimeType: "application/json",
        abortSignal: modelDeadline(),
      },
    });
  } catch (err) {
    return { result: EMPTY, error: modelFailureReason(err) };
  }

  const raw = response.text;
  if (!raw) return { result: EMPTY, error: "the AI provider returned nothing" };

  const parsed = parseEnrichmentResponse(raw);
  if (!parsed) {
    return { result: EMPTY, error: "the AI provider's response wasn't valid JSON" };
  }

  return { result: parsed, error: null };
}

/**
 * The pure half: text in, a validated Enriched out or null.
 *
 * Split out so it can be tested without a network call or an API key — the
 * shape check and the caps below are the part most likely to silently drift
 * (a model returning a string instead of an array, say), and that is exactly
 * what a gate can catch offline.
 */
export function parseEnrichmentResponse(raw: string): Enriched | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isEnriched(parsed)) return null;

  /*
   * Trimmed and capped, not trusted further than that. This is still a
   * proposal a person reviews — the cap exists so a run-on paragraph or a
   * fifty-item list does not arrive in a form built for a sentence and a
   * handful of rows.
   */
  const services = parsed.services
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const about = parsed.about.trim().slice(0, 600);

  return { services, about };
}
