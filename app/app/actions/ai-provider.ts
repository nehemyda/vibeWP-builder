"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiProviderSettings } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";

/** Bound to <form action={updateAiProviderSettingsAction}> on /admin/ai-providers. */
export async function updateAiProviderSettingsAction(formData: FormData) {
  await requirePermission("ai_providers.manage");

  const settings = await getAiProviderSettings();
  const activeProvider = String(formData.get("activeProvider") ?? "mock") as
    | "mock"
    | "gemini"
    | "openai"
    | "claude";

  // Key inputs are left blank in the UI when a key is already saved (we never
  // echo real key values back to the browser) — so only overwrite a key if
  // the admin actually typed a new one.
  const geminiApiKey = String(formData.get("geminiApiKey") ?? "").trim();
  const openaiApiKey = String(formData.get("openaiApiKey") ?? "").trim();
  const claudeApiKey = String(formData.get("claudeApiKey") ?? "").trim();

  await db
    .update(aiProviderSettings)
    .set({
      activeProvider,
      updatedAt: new Date(),
      ...(geminiApiKey && { geminiApiKey }),
      ...(openaiApiKey && { openaiApiKey }),
      ...(claudeApiKey && { claudeApiKey }),
    })
    .where(eq(aiProviderSettings.id, settings.id));

  redirect("/admin/ai-providers?saved=1");
}
