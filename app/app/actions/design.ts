"use server";

import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, platformSettings } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { DESIGN_TOKENS, sanitiseTokens, type DesignTokens } from "@/lib/design/tokens";
import { requirePermission } from "@/lib/auth/require-permission";
import { getPlatformSettings } from "@/lib/platform-settings";
import { logActivity } from "@/lib/activity";
import { redirect } from "next/navigation";

/**
 * Saves the site's hand-set design values.
 *
 * Sanitised on the way in even though the panel only ever sends bounded
 * values: these end up in a stylesheet on a public page, and the panel is not
 * the only thing that can call a server action. Unknown names are dropped,
 * out-of-range numbers are dropped, and a value equal to the design's own
 * default is stored as absent rather than pinned — so a site never freezes
 * against a stylesheet that may improve later.
 *
 * Ownership is checked in the WHERE clause as well as before it, which is the
 * pattern every write in this codebase uses: a check that happens earlier than
 * the write is a check something can be slipped past.
 */
export async function saveDesignTokensAction(opts: {
  siteId: string;
  tokens: DesignTokens;
}): Promise<{ ok: true; tokens: DesignTokens } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!(await canEditSite(user.id, opts.siteId))) {
    return { ok: false, message: "You don't have access to this site." };
  }

  const tokens = sanitiseTokens(opts.tokens);
  await db
    .update(sites)
    .set({ designTokens: tokens, lastEditedAt: new Date() })
    .where(eq(sites.id, opts.siteId));

  return { ok: true, tokens };
}

/**
 * Saves the PLATFORM's design defaults — the layer under every site.
 *
 * Separate from saveDesignTokensAction, and not a parameter on it, because the
 * two differ in who may call them and what they reach. A site's tokens are
 * checked against canEditSite; these are checked against being an
 * administrator, and a mistake here moves every site on the platform rather
 * than one.
 *
 * Sanitised the same way and for the same reason: these reach a public
 * stylesheet, and the form is not the only thing that can call a server
 * action. A value equal to the stylesheet's own default is stored as absent,
 * so the platform never pins itself against a stylesheet that may improve.
 */
export async function savePlatformDesignAction(formData: FormData) {
  const { profile: actor } = await requirePermission("settings.manage");

  const raw: Record<string, number> = {};
  for (const spec of DESIGN_TOKENS) {
    const v = formData.get(spec.name);
    if (v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) raw[spec.name] = n;
  }

  /* An explicit reset has to be able to reach null, which dragging cannot:
     every slider sitting at its default is indistinguishable from "unset". */
  const reset = formData.get("reset") === "1";
  const tokens = reset ? null : sanitiseTokens(raw);

  const settings = await getPlatformSettings();
  await db
    .update(platformSettings)
    .set({ designTokens: tokens, updatedAt: new Date() })
    .where(eq(platformSettings.id, settings.id));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "platform.design_changed",
    targetType: "platform",
    targetId: settings.id,
    targetLabel: "Global design",
    metadata: { tokens: tokens ?? {}, reset },
  });

  redirect("/admin/design?saved=1");
}
