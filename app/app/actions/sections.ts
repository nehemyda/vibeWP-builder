"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sections } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { getSectionByKey } from "@/lib/sections";
import { reconcileSections } from "@/lib/sections/resolve";

/**
 * NO createSectionAction.
 *
 * There used to be one, and an "Add a section" form beside it. It let an admin
 * insert a row naming a componentType — say "TestimonialGrid" — that had no
 * implementation in code. The section then appeared in the library, could be
 * chosen, and rendered nothing at all.
 *
 * Sections exist by being written in lib/sections/ and registered. This file
 * only edits the policy overlay on sections that already exist. reconcile()
 * below creates the rows automatically, so nothing needs adding by hand.
 */
export async function reconcileSectionsAction() {
  await requirePermission("sections.manage");
  const created = await reconcileSections();
  redirect(created > 0 ? `/admin/sections?added=${created}` : "/admin/sections");
}

/** Bound to the settings form on /admin/sections/[key]. */
export async function updateSectionAction(formData: FormData) {
  const { profile: actor } = await requirePermission("sections.manage");

  const key = String(formData.get("key") ?? "").trim();
  // Guard against editing policy for something that cannot render.
  if (!key || !getSectionByKey(key)) redirect("/admin/sections");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const promptOverride = String(formData.get("aiPromptOverride") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const isActive = formData.get("isActive") === "on";

  // Plans arrive as repeated checkbox values; empty means "every plan".
  const allowedPlans = formData.getAll("allowedPlans").map(String).filter(Boolean);

  await db
    .update(sections)
    .set({
      name: name || undefined,
      description: description || null,
      category: category || undefined,
      // Empty textarea clears the override so the code default takes over
      // again — that has to be reachable, or a bad prompt is permanent.
      aiPromptOverride: promptOverride || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive,
      allowedPlans,
      updatedAt: new Date(),
    })
    .where(eq(sections.key, key));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "section.edited",
    targetType: "section",
    targetId: key,
    targetLabel: name || key,
    metadata: {
      isActive,
      usesPromptOverride: Boolean(promptOverride),
      allowedPlans: allowedPlans.length ? allowedPlans : "all",
    },
  });

  redirect(`/admin/sections/${key}?saved=1`);
}

/** Removes a policy row whose section no longer exists in code. */
export async function deleteOrphanSectionAction(formData: FormData) {
  const { profile: actor } = await requirePermission("sections.manage");

  const id = String(formData.get("sectionId") ?? "");
  const key = String(formData.get("key") ?? "");
  // Refuse if the key DOES resolve — that would be deleting a live section's settings.
  if (!id || getSectionByKey(key)) redirect("/admin/sections");

  await db.delete(sections).where(eq(sections.id, id));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "section.deleted",
    targetType: "section",
    targetId: id,
    targetLabel: key,
    metadata: { reason: "orphaned row — no matching section in code" },
  });

  redirect("/admin/sections");
}
