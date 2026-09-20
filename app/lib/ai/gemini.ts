import { GoogleGenAI } from "@google/genai";
import type { HeroContent } from "@/lib/mock-ai";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";

const MODEL = "gemini-2.5-flash";

function isHeroContent(value: unknown): value is HeroContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.eyebrow === "string" &&
    typeof v.heading === "string" &&
    typeof v.body === "string" &&
    typeof v.primaryLabel === "string" &&
    typeof v.outlineLabel === "string"
  );
}

export async function generateHeroContentWithGemini(
  prompt: string,
  apiKey: string,
): Promise<HeroContent> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are writing homepage hero content for a small business website builder.
Business description from the customer: "${prompt}"

Write compelling, specific marketing copy for this exact business — not generic placeholder text. Return ONLY a JSON object with these exact fields:
- eyebrow: a short uppercase badge/label, max 40 characters (e.g. "24/7 LIVE DISPATCH", "FREE CONSULTATION")
- heading: a punchy headline, max 90 characters
- body: one or two sentences of supporting copy, max 220 characters
- primaryLabel: the main call-to-action button text, max 30 characters
- outlineLabel: a secondary call-to-action button text, max 30 characters`,
    config: {
      responseMimeType: "application/json",
      abortSignal: modelDeadline(),
    },
  });
  await captureUsage(response, MODEL);

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  const parsed: unknown = JSON.parse(text);
  if (!isHeroContent(parsed)) {
    throw new Error("Gemini response didn't match the expected shape.");
  }
  return parsed;
}
