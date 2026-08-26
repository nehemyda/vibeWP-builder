"use server";

import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { generateHeroContentWithGemini } from "@/lib/ai/gemini";
import { generateHeroContent, type HeroContent } from "@/lib/mock-ai";

/**
 * Called by the builder's autostart flow. Uses whichever provider is active
 * in /admin/ai-providers; falls back to the deterministic keyword mock if no
 * provider is configured or the real call fails for any reason, so the
 * builder never just breaks because of a bad key or a rate limit.
 */
export async function generateHeroContentAction(prompt: string): Promise<HeroContent> {
  const settings = await getAiProviderSettings();

  if (settings.activeProvider === "gemini" && settings.geminiApiKey) {
    try {
      return await generateHeroContentWithGemini(prompt, settings.geminiApiKey);
    } catch (err) {
      console.error("Gemini generation failed, falling back to keyword mock:", err);
    }
  }

  return generateHeroContent(prompt);
}
