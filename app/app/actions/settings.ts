"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { getPlatformSettings } from "@/lib/platform-settings";
import { logActivity } from "@/lib/activity";

/** Bound to <form action={updatePlatformSettingsAction}> on /admin/settings. */
export async function updatePlatformSettingsAction(formData: FormData) {
  const { profile: actor } = await requirePermission("settings.manage");

  const settings = await getPlatformSettings();
  const platformName = String(formData.get("platformName") ?? "").trim() || "VibeWP";
  const supportEmail = String(formData.get("supportEmail") ?? "").trim();
  const defaultTimezone = String(formData.get("defaultTimezone") ?? "").trim() || "America/New_York";
  const maintenanceMode = formData.get("maintenanceMode") === "on";

  await db
    .update(platformSettings)
    .set({
      platformName,
      supportEmail: supportEmail || null,
      defaultTimezone,
      maintenanceMode,
      updatedAt: new Date(),
    })
    .where(eq(platformSettings.id, settings.id));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "settings.edited",
    targetType: "platform_settings",
    targetId: settings.id,
  });

  redirect("/admin/settings?saved=1");
}
