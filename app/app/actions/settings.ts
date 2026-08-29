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
  /*
   * Trimmed and stored as null when blank, never as "".
   *
   * The builder's site panel decides whether to show DNS instructions by
   * whether these are set; an empty string is truthy enough to slip through a
   * loose check and would show a client an empty A record to copy.
   */
  const hostingIpv4 = String(formData.get("hostingIpv4") ?? "").trim();
  const hostingCname = String(formData.get("hostingCname") ?? "").trim();

  await db
    .update(platformSettings)
    .set({
      platformName,
      supportEmail: supportEmail || null,
      defaultTimezone,
      maintenanceMode,
      hostingIpv4: hostingIpv4 || null,
      hostingCname: hostingCname || null,
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
