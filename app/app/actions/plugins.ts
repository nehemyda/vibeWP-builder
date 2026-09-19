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

/**
 * Asks wordpress.org whether a slug is real, and what the plugin is called.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A TYPO HAS TO BE CAUGHT HERE
 *
 * Nothing else looks at a slug until a site is exported, and by then the
 * failure has moved: it surfaces as "Plugin not found" in one client's
 * builder chat, days later, and only if somebody reads it. The slug is also
 * the one field nobody can check by eye — Yoast SEO installs as
 * "wordpress-seo", so a plausible-looking guess is exactly what goes wrong.
 *
 * WHY A FAILED CHECK DOES NOT BLOCK THE SAVE
 *
 * Only a 404 is an answer. A timeout or a DNS failure says nothing about the
 * slug, and refusing on one would mean wordpress.org being unreachable stops
 * an administrator editing their own list. So: 404 refuses, anything else
 * saves and says it could not be confirmed.
 * ─────────────────────────────────────────────────────────────────────
 */
/**
 * The directory's name for a plugin, reduced to something worth showing.
 *
 * wordpress.org returns a marketing string, entity-encoded: Yoast SEO comes
 * back as "Yoast SEO &#8211; Advanced SEO with real-time guidance and built-in
 * AI". That is a line of ad copy, not a label for a list of four rows.
 *
 * The directory's convention is "Name – tagline", so the part before the first
 * dash is the name. A plugin whose real name contains a dash keeps it, because
 * only a SPACED dash is treated as the separator.
 */
function tidyPluginName(raw: string): string {
  const decoded = raw
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  return decoded.split(/\s[-\u2013\u2014]\s/)[0].trim().slice(0, 80);
}

type SlugCheck =
  | { status: "ok"; name: string }
  | { status: "missing" }
  | { status: "unverified" };

async function checkSlug(slug: string): Promise<SlugCheck> {
  try {
    const res = await fetch(`https://api.wordpress.org/plugins/info/1.0/${slug}.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { status: "missing" };
    if (!res.ok) return { status: "unverified" };

    const body = (await res.json()) as { name?: string; error?: string };
    if (body.error) return { status: "missing" };
    return { status: "ok", name: typeof body.name === "string" ? tidyPluginName(body.name) : "" };
  } catch {
    return { status: "unverified" };
  }
}

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
     checked rather than merely trimmed. */
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!slug || !SLUG.test(slug)) redirect("/admin/plugins?error=slug");

  const check = await checkSlug(slug);
  if (check.status === "missing") redirect("/admin/plugins?error=notfound");

  /* The name comes from the directory when it can, which is the whole reason
     that field is optional: knowing a slug should be enough. */
  const resolvedName = name || (check.status === "ok" ? check.name : "");
  if (!resolvedName) redirect("/admin/plugins?error=name");

  const [row] = await db
    .insert(platformPlugins)
    .values({ slug, name: resolvedName, purpose, isActive, autoActivate, sortOrder: 999 })
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
    metadata: { slug, verified: check.status === "ok" },
  });
  redirect(check.status === "unverified" ? "/admin/plugins?unverified=1" : "/admin/plugins?saved=1");
}
