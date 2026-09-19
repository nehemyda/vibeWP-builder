import { GoogleGenAI } from "@google/genai";
import { modelDeadline } from "./deadline";

const MODEL = "gemini-2.5-flash";

/**
 * Alt text written from the photograph itself.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE MODEL IS SHOWN THE PICTURE
 *
 * Alt text describes what is in an image. Written from a filename it is a
 * guess — "pexels-photo-31409370.jpeg" says nothing, and "hero.jpg" says
 * less. Written from the surrounding copy it describes the SECTION, which is
 * the commonest way alt text ends up repeating the heading a screen reader
 * has already read out.
 *
 * So the bytes go to the model. It is the only input that answers the question
 * being asked.
 *
 * WHY SEVERAL AT ONCE
 *
 * A page with six photographs of the same bakery invites six descriptions
 * that all begin "A display of freshly baked". Sent together, the model can
 * tell them apart — the same reason the meta tags are asked for as a set.
 *
 * WHY IT IS TOLD THE BUSINESS
 *
 * "A person in an apron holding a tray" is accurate and useless. Knowing it
 * is a bakery in Bath produces "A baker lifting a tray of sourdough loaves
 * from the oven", which is what someone who cannot see the picture needs.
 *
 * WHAT IT IS TOLD NOT TO DO
 *
 * No "image of", no "photo of" — a screen reader already announces that it is
 * an image, so the words are read out twice. And nothing longer than a
 * sentence: alt text is spoken, and a paragraph is a wall to sit through.
 * ─────────────────────────────────────────────────────────────────────
 */

export type AltSubject = {
  /** Stable handle so the answer can be matched back to the placement. */
  key: string;
  bytes: Buffer;
  mimeType: string;
  /** Where it sits, so the model can prefer what the page is about. */
  context: string;
};

/**
 * What is being written.
 *
 * The two are not the same job. Alt REPLACES the picture for someone who
 * cannot see it, so it is a sentence about what is visible. A title is a short
 * label shown on hover — a few words, closer to a caption in a filing system —
 * and if it repeats the alt then some screen readers read one sentence twice.
 */
export type AltKind = "alt" | "title";

export async function generateAltWithGemini(
  business: string,
  subjects: AltSubject[],
  apiKey: string,
  kind: AltKind = "alt",
): Promise<Map<string, string>> {
  if (subjects.length === 0) return new Map();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              kind === "alt"
                ? `You are writing alt text for photographs on a small business website.

${business}

${subjects.length} image${subjects.length === 1 ? "" : "s"} follow${subjects.length === 1 ? "s" : ""}, in order. For each one, describe what is actually visible.

Where each appears:
${subjects.map((s, i) => `${i + 1}. ${s.context}`).join("\n")}

Rules:
- Describe what is IN the picture, not what the page says.
- One short sentence each, at most 125 characters.
- Never begin with "Image of", "Photo of", "A picture of" — a screen reader
  already says it is an image.
- No text in quotes, no keyword lists, no mention of the business name unless
  it is legible in the photograph.
- Every description must be different from the others.
- British English.

Return ONLY JSON: {"alt":["…first image…","…second image…"]} with exactly
${subjects.length} entries, in the same order as the images.`
                : `You are naming photographs on a small business website.

${business}

${subjects.length} image${subjects.length === 1 ? "" : "s"} follow${subjects.length === 1 ? "s" : ""}, in order. Give each a short title — the kind of label that identifies it in a list of files.

Where each appears:
${subjects.map((s, i) => `${i + 1}. ${s.context}`).join("\n")}

Rules:
- Two to five words. Capitalise it like a caption, not like a headline.
- Name the subject, not the scene: "Sourdough loaves cooling", not "A tray of
  freshly baked sourdough loaves cooling on a wire rack in a bakery".
- No full stop, no quotes, no file extensions, no "Image" or "Photo".
- Every title must be different from the others.
- British English.

Return ONLY JSON: {"alt":["…first…","…second…"]} with exactly
${subjects.length} entries, in the same order as the images.`,
          },
          ...subjects.map((s) => ({
            inlineData: { mimeType: s.mimeType, data: s.bytes.toString("base64") },
          })),
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      abortSignal: modelDeadline(),
    },
  });

  const text = response.text;
  if (!text) throw new Error("The model returned an empty response.");

  const parsed = JSON.parse(text) as { alt?: unknown };
  const answers: unknown[] = Array.isArray(parsed.alt) ? parsed.alt : [];
  if (answers.length === 0) {
    throw new Error("The model's response didn't match the expected shape.");
  }

  /*
   * Matched BY POSITION, which is why the count is checked. A short response
   * would otherwise shift every description onto the wrong photograph — the
   * one failure here that is worse than no alt text at all, because it is
   * confidently wrong and invisible to anyone who can see the page.
   */
  if (answers.length !== subjects.length) {
    throw new Error(
      `The model described ${answers.length} of ${subjects.length} images, so none were used.`,
    );
  }

  const out = new Map<string, string>();
  subjects.forEach((subject, i) => {
    const alt = answers[i];
    if (typeof alt === "string" && alt.trim()) out.set(subject.key, alt.trim().slice(0, 300));
  });
  return out;
}
