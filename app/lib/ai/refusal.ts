/**
 * Removes our vocabulary from a refusal shown to a client.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A FUNCTION AND NOT JUST A PROMPT RULE
 *
 * The planner prompt tells the model to write refusals for a business owner who
 * has never heard of this system, and shows it a worked example of the right
 * and wrong wording. It still answered:
 *
 *   "The current header design ('HeaderSimple') does not include a button."
 *
 * A prompt is guidance the model may follow. A client reading their own site's
 * internals is a fact they experience. Where the two disagree, the fact wins, so
 * node types and registry keys are stripped here regardless of what was asked
 * for upstream.
 *
 * Kept out of the "use server" action file deliberately: a server-action module
 * may only export async functions, so anything living there cannot be unit
 * tested. This is pure, so it can be.
 */

/** `HeaderSimple`, `('HeaderSimple')`, `"ContentGallery"` — our node types. */
const NODE_TYPE_IN_PARENS = /\s*\(\s*["'`]?[A-Z][A-Za-z]*["'`]?\s*\)/g;
/** `(header-cta)`, `('content-gallery')` — our registry keys. */
const REGISTRY_KEY_IN_PARENS = /\s*\(\s*["'`]?[a-z]+(?:-[a-z]+)+["'`]?\s*\)/g;
/** A bare quoted node type left mid-sentence. */
const QUOTED_NODE_TYPE = /\s*["'`][A-Z][A-Za-z]*["'`]/g;

export function plainRefusal(reason: string): string {
  const cleaned = reason
    .replace(NODE_TYPE_IN_PARENS, "")
    .replace(REGISTRY_KEY_IN_PARENS, "")
    .replace(QUOTED_NODE_TYPE, "")
    // "is not a supported operation" is the phrasing that started this.
    .replace(/\bis not a supported operation\b/gi, "isn't something I can do to this site")
    .replace(/\bunsupported operation\b/gi, "something I can't do")
    // Tidy the punctuation the removals leave behind.
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || "I can't do that to this site yet.";
}
