import { db } from "@/lib/db";
import { aiProviderSettings } from "@/lib/db/schema";

/** Always exactly one row — created on first access if it doesn't exist yet. */
export async function getAiProviderSettings() {
  const existing = await db.query.aiProviderSettings.findFirst();
  if (existing) return existing;

  const [created] = await db.insert(aiProviderSettings).values({}).returning();
  return created;
}
