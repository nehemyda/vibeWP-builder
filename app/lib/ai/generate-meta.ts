import { GoogleGenAI } from "@google/genai";
import { describeBusiness, type BusinessContext } from "./business-context";
import { DESC_LIMIT, TITLE_LIMIT } from "@/lib/seo/limits";

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
};

export type MetaResult = { slug: string; title: string; description: string };

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
      `${i + 1}. slug: "${p.slug}"\n   page name: ${p.name}\n   what is on it: ${p.excerpt || "(no copy yet)"}`,
  )
  .join("\n\n")}

Rules:
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
{"pages":[{"slug":"home","title":"…","description":"…"}]}
with one entry per page, using exactly the slugs given.`,
    config: { responseMimeType: "application/json" },
  });

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
        typeof r.title === "string" &&
        typeof r.description === "string" &&
        // A slug nobody asked about would write meta onto the wrong page, or
        // none — either way it is not something to guess at.
        wanted.has(r.slug)
      );
    })
    .map((row) => ({
      slug: row.slug,
      title: row.title.trim(),
      description: row.description.trim(),
    }));
}
