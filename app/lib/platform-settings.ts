import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";

/** Always exactly one row — created on first access if it doesn't exist yet. */
export async function getPlatformSettings() {
  const existing = await db.query.platformSettings.findFirst();
  if (existing) return existing;

  const [created] = await db.insert(platformSettings).values({}).returning();
  return created;
}
