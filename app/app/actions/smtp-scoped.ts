"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { smtpSettings, sites, agencies } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { requireAgency } from "@/lib/auth/require-agency";
import { resolveSmtpForSite } from "@/lib/mail/resolve";

/**
 * An agency's or a client's own mail account.
 *
 * ─────────────────────────────────────────────────────────────────────
 * OPTIONAL BY DESIGN
 *
 * The platform's account sends everything by default. A row exists here only
 * when someone wants mail to come from THEIR domain and name — which is the
 * whole reason to configure it, and something most clients never will.
 *
 * Saving an empty host DELETES the row rather than storing a blank one. A
 * half-filled record would otherwise shadow the working account above it, and
 * "I cleared it to go back to the default" is exactly what someone means when
 * they empty the field.
 */

type Fields = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
};

function read(formData: FormData): Fields {
  return {
    host: String(formData.get("host") ?? "").trim(),
    port: Number(formData.get("port") ?? 587) || 587,
    username: String(formData.get("username") ?? "").trim(),
    // Blank means "keep what is stored" — the real value is never echoed to the
    // browser, so an empty box is not an instruction to erase it.
    password: String(formData.get("password") ?? "").trim(),
    fromEmail: String(formData.get("fromEmail") ?? "").trim(),
    fromName: String(formData.get("fromName") ?? "").trim(),
    secure: formData.get("secure") === "on",
  };
}

async function upsert(
  scope: "agency" | "site",
  owner: { agencyId?: string; siteId?: string },
  f: Fields,
) {
  const where =
    scope === "agency"
      ? and(eq(smtpSettings.scope, "agency"), eq(smtpSettings.agencyId, owner.agencyId!))
      : and(eq(smtpSettings.scope, "site"), eq(smtpSettings.siteId, owner.siteId!));

  const existing = await db.query.smtpSettings.findFirst({ where });

  if (!f.host) {
    if (existing) await db.delete(smtpSettings).where(eq(smtpSettings.id, existing.id));
    return;
  }

  if (existing) {
    await db
      .update(smtpSettings)
      .set({
        host: f.host,
        port: f.port,
        username: f.username || null,
        fromEmail: f.fromEmail || null,
        fromName: f.fromName || "VibeWP",
        secure: f.secure,
        updatedAt: new Date(),
        ...(f.password && { password: f.password }),
      })
      .where(eq(smtpSettings.id, existing.id));
    return;
  }

  await db.insert(smtpSettings).values({
    scope,
    agencyId: owner.agencyId ?? null,
    siteId: owner.siteId ?? null,
    host: f.host,
    port: f.port,
    username: f.username || null,
    password: f.password || null,
    fromEmail: f.fromEmail || null,
    fromName: f.fromName || "VibeWP",
    secure: f.secure,
  });
}

export async function saveSiteSmtpAction(smbId: string, formData: FormData): Promise<void> {
  const { site } = await requireSiteAccess(smbId);
  await upsert("site", { siteId: site.id }, read(formData));
  revalidatePath("/dashboard", "layout");
}

export async function saveAgencySmtpAction(partnerId: string, formData: FormData): Promise<void> {
  const { agency } = await requireAgency();
  // No agency, or the wrong one: change nothing rather than guess which was
  // meant. An agency id in a URL is not authority to write to it.
  if (!agency || agency.partnerId !== partnerId) return;
  await upsert("agency", { agencyId: agency.id }, read(formData));
  revalidatePath("/agency", "layout");
}

/**
 * Which account a site's mail would actually go through, and from where.
 *
 * Shown in the UI because "email works" and "email works because the PLATFORM
 * is sending it" are different facts, and only one of them means the client's
 * branding is on the message.
 */
export async function describeSmtpForSite(siteId: string) {
  const resolved = await resolveSmtpForSite(siteId);
  if (!resolved) return { configured: false as const };
  return {
    configured: true as const,
    level: resolved.level,
    fromEmail: resolved.fromEmail,
    fromName: resolved.fromName,
  };
}
