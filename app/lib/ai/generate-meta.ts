import { GoogleGenAI } from "@google/genai";
import { describeBusiness, type BusinessContext } from "./business-context";
import { DESC_LIMIT, TITLE_LIMIT } from "@/lib/seo/limits";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";

const MODEL = "gemini-2.5-flash";

/**
 * Meta titles and descriptions for a whole site, in one call.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ONE CALL AND NOT ONE PER PAGE
 *
 * Nine separate calls produce nine titles that do not know about each other.
 * Every one of them opens with the business name, three of them promise the
 * same thing, and two end up identical — which is the single most common real
 * SEO fault on a small site, and the one the panel already flags. Asking once
 * for the whole set is the only way the model can differentiate them, because
 * differentiating is a property of the SET.
 *
 * It is also cheaper and faster, but that is not the reason.
 *
 * WHAT IT IS GIVEN
 *
 * The business, and for each page its slug, its name and the words actually on
 * it. A description written from the page beats one written from the slug:
 * "services" tells the model nothing, whereas the headings under it say what
 * the business actually does there.
 *
 * WHY THE OUTPUT IS VALIDATED AND NOT TRUSTED
 *
 * The model is asked for lengths and will sometimes exceed them. Over-length
 * copy is KEPT and flagged by the panel rather than discarded — a slightly
 * long description is useful and a missing one is not. What is rejected is a
 * response of the wrong shape, or a slug nobody asked about.
 * ─────────────────────────────────────────────────────────────────────
 */

/** One page, as the model needs to see it. */
export type MetaSubject = {
  slug: string;
  name: string;
  /** The visible words on the page, already flattened and truncated. */
  excerpt: string;
  /**
   * The keyword the client has already chosen, if any.
   *
   * Present means it is a constraint, not a suggestion — the model is told to
   * write to it rather than pick its own. That is the difference between a
   * field the client owns and a field the model overwrites.
   */
  focusKeyword?: string;
};

export type MetaResult = {
  slug: string;
  /**
   * The phrase the page is being written to be found by.
   *
   * Chosen by the model from the page's own content unless the client has
   * already set one, in which case theirs is passed in and the title and
   * description are written around it. The keyword is not decoration: asking
   * for a title without one produces a title about the page in general, and
   * "in general" is not a thing anybody searches for.
   */
  focusKeyword: string;
  title: string;
  description: string;
};

export async function generateMetaWithGemini(
  business: BusinessContext,
  pages: MetaSubject[],
  apiKey: string,
): Promise<MetaResult[]> {
  if (pages.length === 0) return [];
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are writing search-engine meta tags for a small business website.

${describeBusiness(business)}

Write a meta title and meta description for EACH page below. The pages are
given together on purpose: they must not repeat each other.

${pages
  .map(
    (p, i) =>
      `${i + 1}. slug: "${p.slug}"\n   page name: ${p.name}\n   what is on it: ${p.excerpt || "(no copy yet)"}` +
      (p.focusKeyword
        ? `\n   FOCUS KEYWORD (chosen by the owner — use this, do not replace it): ${p.focusKeyword}`
        : ""),
  )
  .join("\n\n")}

For each page, first decide its FOCUS KEYWORD: the one phrase a customer would
type into Google to find that page. Read it off what is actually on the page —
the service it describes, the town it serves — not off the slug. Two to five
words, lower case, no punctuation. Where a focus keyword is already given
above, keep it exactly and write to it.

Then write the title and description AROUND that keyword.

Rules:
- The focus keyword must appear in the title, and in the description, reading
  naturally. If it cannot be made to read naturally, choose a better keyword.
- Each title at most ${TITLE_LIMIT} characters. Each description at most ${DESC_LIMIT}.
- Every title must be DIFFERENT from every other, and so must every description.
- Do not begin every title with the business name. Use it where it helps a
  person recognise the business, usually the home page.
- Say what the page is FOR, in the words a customer would search for,
  including the town where that is natural.
- No quotation marks, no "Welcome to", no "Best in town" puffery, no keyword
  lists. Write the sentence a person would actually click.
- Use British English if the business is in the UK.

Return ONLY a JSON object of the form:
{"pages":[{"slug":"home","focusKeyword":"…","title":"…","description":"…"}]}
with one entry per page, using exactly the slugs given.`,
    config: {
      responseMimeType: "application/json",
      abortSignal: modelDeadline(),
    },
  });
  await captureUsage(response, MODEL);

  const text = response.text;
  if (!text) throw new Error("The model returned an empty response.");

  const parsed: unknown = JSON.parse(text);
  const rows = (parsed as { pages?: unknown })?.pages;
  if (!Array.isArray(rows)) {
    throw new Error("The model's response didn't match the expected shape.");
  }

  const wanted = new Set(pages.map((p) => p.slug));
  return rows
    .filter((row): row is MetaResult => {
      const r = row as Partial<MetaResult>;
      return (
        typeof r.slug === "string" &&
        typeof r.focusKeyword === "string" &&
        typeof r.title === "string" &&
        typeof r.description === "string" &&
        // A slug nobody asked about would write meta onto the wrong page, or
        // none — either way it is not something to guess at.
        wanted.has(r.slug)
      );
    })
    .map((row) => ({
      slug: row.slug,
      focusKeyword: row.focusKeyword.trim().toLowerCase(),
      title: row.title.trim(),
      description: row.description.trim(),
    }));
}
