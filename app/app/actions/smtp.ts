"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { smtpSettings } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { getSmtpSettings } from "@/lib/smtp-settings";
import { sendMail } from "@/lib/mailer";
import { logActivity } from "@/lib/activity";

/** Bound to <form action={updateSmtpSettingsAction}> on /admin/settings/smtp. */
export async function updateSmtpSettingsAction(formData: FormData) {
  const { profile: actor } = await requirePermission("smtp.manage");

  const settings = await getSmtpSettings();
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? 587) || 587;
  const username = String(formData.get("username") ?? "").trim();
  const fromEmail = String(formData.get("fromEmail") ?? "").trim();
  const fromName = String(formData.get("fromName") ?? "").trim() || "VibeWP";
  const secure = formData.get("secure") === "on";

  // Password input is left blank in the UI when one is already saved (we
  // never echo the real value back to the browser) — only overwrite it if
  // the admin actually typed a new one.
  const password = String(formData.get("password") ?? "").trim();

  await db
    .update(smtpSettings)
    .set({
      host: host || null,
      port,
      username: username || null,
      fromEmail: fromEmail || null,
      fromName,
      secure,
      updatedAt: new Date(),
      ...(password && { password }),
    })
    .where(eq(smtpSettings.id, settings.id));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "smtp.edited",
    targetType: "smtp_settings",
    targetId: settings.id,
  });

  redirect("/admin/settings/smtp?saved=1");
}

/** Bound to <form action={sendTestEmailAction}> — sends a real test email to the admin's own address. */
export async function sendTestEmailAction(formData: FormData) {
  const { profile: actor, user } = await requirePermission("smtp.manage");

  const to = String(formData.get("to") ?? user.email ?? "").trim();
  if (!to) redirect("/admin/settings/smtp?error=No+recipient+address");

  try {
    await sendMail({
      to,
      subject: "VibeWP SMTP test",
      text: `This is a test email from VibeWP, sent by ${actor.fullName} to confirm your SMTP settings work.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test email.";
    redirect(`/admin/settings/smtp?error=${encodeURIComponent(message)}`);
  }

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "smtp.test_sent",
    targetType: "smtp_settings",
    targetLabel: to,
  });

  redirect("/admin/settings/smtp?testSent=1");
}
