"use server";

import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { generateHeroContentWithGemini } from "@/lib/ai/gemini";
import { searchPhoto } from "@/lib/images/pexels";
import { generateHeroContent, heroImageQuery, type HeroContent } from "@/lib/mock-ai";

/** Stable per-prompt spread, so two businesses in one vertical don't collide. */
function seedFrom(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Called by the builder's autostart flow. Uses whichever provider is active
 * in /admin/ai-providers; falls back to the deterministic keyword mock if no
 * provider is configured or the real call fails for any reason, so the
 * builder never just breaks because of a bad key or a rate limit.
 */
export async function generateHeroContentAction(prompt: string): Promise<HeroContent> {
  const settings = await getAiProviderSettings();

  let content: HeroContent | null = null;

  if (settings.activeProvider === "gemini" && settings.geminiApiKey) {
    try {
      content = await generateHeroContentWithGemini(prompt, settings.geminiApiKey);
    } catch (err) {
      console.error("Gemini generation failed, falling back to keyword mock:", err);
    }
  }

  content ??= generateHeroContent(prompt);

  // Copy first, photo second. Neither provider writes images, so the hero
  // photo is sourced separately — and a miss here leaves content untouched
  // rather than failing the generation.
  const photo = await searchPhoto(heroImageQuery(prompt), seedFrom(prompt));
  if (photo) {
    content = {
      ...content,
      image: {
        url: photo.url,
        alt: photo.alt,
        photographer: photo.photographer,
        photographerUrl: photo.photographerUrl,
      },
    };
  }

  return content;
}
