"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, agencies, businessProfiles } from "@/lib/db/schema";
import { generatePartnerId } from "@/lib/ids";
import { requirePermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { planKeyOf } from "@/lib/billing";

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/** Bound to <form action={createAgencyAction}> on /admin/agencies/new — a real form action. */
export async function createAgencyAction(formData: FormData) {
  const { profile: actor } = await requirePermission("agencies.manage");

  const name = String(formData.get("name") ?? "").trim();
  const plan = planKeyOf(String(formData.get("plan") ?? "")) || "starter";
  const ownerFullName = String(formData.get("ownerFullName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const existingOwnerUserId = String(formData.get("ownerUserId") ?? "").trim();
  if (!name) redirect("/admin/agencies/new");

  let ownerUserId: string;
  if (ownerEmail) {
    if (!ownerFullName) {
      redirect(`/admin/agencies/new?error=${encodeURIComponent("Owner full name is required with an invite email.")}`);
    }
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(ownerEmail);
    if (error || !data.user) {
      redirect(`/admin/agencies/new?error=${encodeURIComponent(error?.message ?? "Could not invite owner.")}`);
    }
    await db
      .insert(profiles)
      .values({ id: data.user.id, fullName: ownerFullName, role: "agency_owner" })
      .onConflictDoNothing();
    ownerUserId = data.user.id;
  } else if (existingOwnerUserId) {
    ownerUserId = existingOwnerUserId;
    await db.update(profiles).set({ role: "agency_owner" }).where(eq(profiles.id, ownerUserId));
  } else {
    redirect(`/admin/agencies/new?error=${encodeURIComponent("Provide an owner email to invite, or pick an existing user.")}`);
  }

  const partnerId = await generatePartnerId();
  const [agency] = await db
    .insert(agencies)
    .values({ partnerId, name, plan, ownerUserId })
    .returning();

  await db.insert(businessProfiles).values({
    ownerType: "agency",
    ownerId: agency.id,
    address: str(formData, "address"),
    city: str(formData, "city"),
    state: str(formData, "state"),
    zip: str(formData, "zip"),
    country: str(formData, "country"),
    websiteAddress: str(formData, "websiteAddress"),
    businessCategories: str(formData, "businessCategories"),
    tags: str(formData, "tags"),
    timezone: str(formData, "timezone"),
    phoneNumber: str(formData, "phoneNumber"),
  });

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "agency.created",
    targetType: "agency",
    targetId: agency.id,
    targetLabel: agency.name,
  });

  redirect(`/admin/agencies/${partnerId}`);
}

/** Bound to <form action={updateAgencyAction}> on the Agency Detail page. */
export async function updateAgencyAction(formData: FormData) {
  const { profile: actor } = await requirePermission("agencies.manage");

  const agencyId = String(formData.get("agencyId") ?? "");
  const partnerId = String(formData.get("partnerId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const plan = planKeyOf(String(formData.get("plan") ?? "")) || "starter";
  if (!agencyId || !name) redirect(`/admin/agencies/${partnerId}`);

  await db.update(agencies).set({ name, plan }).where(eq(agencies.id, agencyId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "agency.edited",
    targetType: "agency",
    targetId: agencyId,
    targetLabel: name,
  });

  redirect(`/admin/agencies/${partnerId}?saved=1`);
}

async function setAgencyStatus(
  agencyId: string,
  partnerId: string,
  status: "active" | "suspended" | "archived" | "deleted",
  action: string,
) {
  const { profile: actor } = await requirePermission("agencies.lifecycle");

  const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, agencyId) });
  await db
    .update(agencies)
    .set({ status, deletedAt: status === "deleted" ? new Date() : null })
    .where(eq(agencies.id, agencyId));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action,
    targetType: "agency",
    targetId: agencyId,
    targetLabel: agency?.name ?? null,
  });

  redirect(`/admin/agencies/${partnerId}`);
}

export async function suspendAgencyAction(agencyId: string, partnerId: string) {
  await setAgencyStatus(agencyId, partnerId, "suspended", "agency.suspended");
}

export async function reactivateAgencyAction(agencyId: string, partnerId: string) {
  await setAgencyStatus(agencyId, partnerId, "active", "agency.reactivated");
}

export async function archiveAgencyAction(agencyId: string, partnerId: string) {
  await setAgencyStatus(agencyId, partnerId, "archived", "agency.archived");
}

/** Restores an archived OR soft-deleted agency back to active. */
export async function restoreAgencyAction(agencyId: string, partnerId: string) {
  await setAgencyStatus(agencyId, partnerId, "active", "agency.restored");
}

/**
 * Soft delete: hides the agency from default listings and blocks its
 * owner/members from logging in, but keeps every row (sites, leads, builder
 * content) intact and recoverable via restoreAgencyAction.
 */
export async function deleteAgencyAction(agencyId: string, partnerId: string) {
  await setAgencyStatus(agencyId, partnerId, "deleted", "agency.deleted");
}
