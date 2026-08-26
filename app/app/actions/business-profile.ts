"use server";

import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies, businessProfiles } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { canEditSite } from "./sites";

async function canEditAgencyBusinessProfile(userId: string, role: string, agencyId: string) {
  if (role === "super_admin") return true;
  if (role === "agency_owner") {
    const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, agencyId) });
    return agency?.ownerUserId === userId;
  }
  return false;
}

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/** Bound to <form action={upsertBusinessProfileAction}>. Shared by agency and site edit forms. */
export async function upsertBusinessProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  if (!actor) redirect("/login");

  const ownerType = String(formData.get("ownerType") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  if (!ownerId || (ownerType !== "agency" && ownerType !== "site")) redirect(redirectTo);

  const allowed =
    ownerType === "agency"
      ? await canEditAgencyBusinessProfile(user.id, actor.role, ownerId)
      : await canEditSite(user.id, ownerId);
  if (!allowed) redirect(redirectTo);

  const fields = {
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
  };

  const existing = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerType, ownerType), eq(businessProfiles.ownerId, ownerId)),
  });

  if (existing) {
    await db
      .update(businessProfiles)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(businessProfiles.id, existing.id));
  } else {
    await db.insert(businessProfiles).values({ ownerType, ownerId, ...fields });
  }

  await logActivity({
    actorUserId: user.id,
    actorName: actor.fullName,
    action: `${ownerType}.business_details_updated`,
    targetType: ownerType,
    targetId: ownerId,
  });

  redirect(`${redirectTo}?saved=1`);
}
