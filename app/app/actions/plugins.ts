"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { platformPlugins } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";

/**
 * Editing the plugin checklist.
 *
 * Nothing here uninstalls. Deactivating a row stops new installs and leaves
 * every site that already has the plugin exactly as it is — see
 * ensureSitePlugins. There is deliberately no "remove from all sites": that
 * would reach into installs a client owns, to undo a decision they did not
 * make.
 */

/** Only what `wp plugin install` accepts: a wordpress.org directory slug. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export async function savePluginAction(formData: FormData) {
  const { profile: actor } = await requirePermission("settings.manage");

  const id = String(formData.get("pluginId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";
  const autoActivate = formData.get("autoActivate") === "on";

  if (id) {
    await db
      .update(platformPlugins)
      .set({ name, purpose, isActive, autoActivate, updatedAt: new Date() })
      .where(eq(platformPlugins.id, id));

    await logActivity({
      actorUserId: actor.id,
      actorName: actor.fullName,
      action: "plugin.edited",
      targetType: "plugin",
      targetId: id,
      targetLabel: name,
      metadata: { isActive, autoActivate },
    });
    redirect("/admin/plugins?saved=1");
  }

  /* A new row. The slug is the only field wp-cli reads, so it is the only one
     validated rather than merely trimmed. */
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!slug || !SLUG.test(slug) || !name) {
    redirect("/admin/plugins?error=slug");
  }

  const [row] = await db
    .insert(platformPlugins)
    .values({ slug, name, purpose, isActive, autoActivate, sortOrder: 999 })
    .onConflictDoNothing()
    .returning();

  if (!row) redirect("/admin/plugins?error=duplicate");

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "plugin.added",
    targetType: "plugin",
    targetId: row.id,
    targetLabel: name,
    metadata: { slug },
  });
  redirect("/admin/plugins?saved=1");
}
