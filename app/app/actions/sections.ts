"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sections } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";

/** Bound to <form action={createSectionAction}> on /admin/sections. */
export async function createSectionAction(formData: FormData) {
  const { profile: actor } = await requirePermission("sections.manage");

  const key = String(formData.get("key") ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const name = String(formData.get("name") ?? "").trim();
  const componentType = String(formData.get("componentType") ?? "").trim();
  const category = String(formData.get("category") ?? "General").trim() || "General";
  if (!key || !name || !componentType) redirect("/admin/sections");

  const [section] = await db
    .insert(sections)
    .values({ key, name, componentType, category, sortOrder: 999 })
    .returning();

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "section.created",
    targetType: "section",
    targetId: section.id,
    targetLabel: name,
  });

  redirect("/admin/sections?saved=1");
}

/** Bound to <form action={updateSectionAction}> per section card on /admin/sections. */
export async function updateSectionAction(formData: FormData) {
  const { profile: actor } = await requirePermission("sections.manage");

  const sectionId = String(formData.get("sectionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "General").trim() || "General";
  const componentType = String(formData.get("componentType") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  if (!sectionId || !name || !componentType) redirect("/admin/sections");

  await db
    .update(sections)
    .set({ name, description: description || null, category, componentType, isActive, updatedAt: new Date() })
    .where(eq(sections.id, sectionId));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "section.edited",
    targetType: "section",
    targetId: sectionId,
    targetLabel: name,
  });

  redirect("/admin/sections?saved=1");
}
