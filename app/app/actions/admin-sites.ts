"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, agencies, sites, sitePages, businessProfiles } from "@/lib/db/schema";
import { generateSmbId } from "@/lib/ids";
import { requirePermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { planKeyOf } from "@/lib/billing";

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/** Bound to <form action={createSiteAction}> on /admin/sites/new — admin-initiated SMB creation. */
export async function createSiteAction(formData: FormData) {
  const { profile: actor } = await requirePermission("sites.manage");

  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  // Canonical key, not whatever a stale form post happens to submit.
  const plan = planKeyOf(String(formData.get("plan") ?? "")) || "starter";
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const ownerFullName = String(formData.get("ownerFullName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();

  const redirectBase = agencyId ? `/admin/sites/new?agencyId=${agencyId}` : "/admin/sites/new";
  if (!name) redirect(redirectBase);
  if (!ownerFullName || !ownerEmail) {
    redirect(`${redirectBase}&error=${encodeURIComponent("Owner full name and email are required.")}`);
  }

  let agency: typeof agencies.$inferSelect | undefined;
  if (agencyId) {
    agency = await db.query.agencies.findFirst({ where: eq(agencies.id, agencyId) });
    if (!agency) redirect(`${redirectBase}&error=${encodeURIComponent("Agency not found.")}`);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(ownerEmail);
  if (error || !data.user) {
    redirect(`${redirectBase}&error=${encodeURIComponent(error?.message ?? "Could not invite owner.")}`);
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
      ownerType: agency ? "agency" : "smb",
      agencyId: agency?.id ?? null,
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
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "site.created",
    targetType: "site",
    targetId: site.id,
    targetLabel: name,
  });

  redirect(
    agency
      ? `/admin/agencies/${agency.partnerId}/sites/${smbId}`
      : `/admin/sites/${smbId}`,
  );
}
