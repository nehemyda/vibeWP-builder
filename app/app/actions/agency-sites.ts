"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { profiles, sites, sitePages, businessProfiles } from "@/lib/db/schema";
import { generateSmbId } from "@/lib/ids";
import { requireAgency } from "@/lib/auth/require-agency";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { planKeyOf } from "@/lib/billing";

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/**
 * Bound to <form action={createAgencySiteAction}> on /agency/sites/new.
 * Onboards a new SMB client: invites a real, distinct smb_owner account —
 * they get their own dashboard scoped to just this one site, same as any
 * directly-signed-up SMB owner.
 */
export async function createAgencySiteAction(formData: FormData) {
  const { user, profile: actor, agency } = await requireAgency();
  if (!agency) redirect("/agency");

  const newSitePath = `/agency/${agency.partnerId}/sites/new`;

  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const plan = planKeyOf(String(formData.get("plan") ?? "")) || planKeyOf(agency.plan);
  const ownerFullName = String(formData.get("ownerFullName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();

  if (!name) redirect(newSitePath);
  if (!ownerFullName || !ownerEmail) {
    redirect(`${newSitePath}?error=${encodeURIComponent("Owner full name and email are required.")}`);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(ownerEmail);
  if (error || !data.user) {
    redirect(`${newSitePath}?error=${encodeURIComponent(error?.message ?? "Could not invite owner.")}`);
  }

  await db
    .insert(profiles)
    .values({ id: data.user.id, fullName: ownerFullName, role: "smb_owner" })
    .onConflictDoNothing();

  const smbId = await generateSmbId();
  const [site] = await db
    .insert(sites)
    .values({
      smbId,
      ownerType: "agency",
      agencyId: agency.id,
      ownerUserId: data.user.id,
      name,
      domain: domain || null,
      plan,
      status: "draft",
    })
    .returning();

  await db.insert(sitePages).values({
    siteId: site.id,
    slug: "home",
    schemaJson: { schemaVersion: "1.0", nodes: [] },
  });

  await db.insert(businessProfiles).values({
    ownerType: "site",
    ownerId: site.id,
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
    actorUserId: user.id,
    actorName: actor.fullName,
    action: "site.created",
    targetType: "site",
    targetId: site.id,
    targetLabel: name,
  });

  redirect(`/agency/${agency.partnerId}/sites/${smbId}`);
}
