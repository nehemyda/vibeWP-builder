import { db } from "@/lib/db";
import { smtpSettings } from "@/lib/db/schema";

/** Always exactly one row — created on first access if it doesn't exist yet. */
export async function getSmtpSettings() {
  const existing = await db.query.smtpSettings.findFirst();
  if (existing) return existing;

  const [created] = await db.insert(smtpSettings).values({}).returning();
  return created;
}
