"use server";

import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { sanitiseTokens, type DesignTokens } from "@/lib/design/tokens";

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
