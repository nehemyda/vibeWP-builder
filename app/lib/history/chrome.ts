import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, siteRevisions } from "@/lib/db/schema";

/**
 * Writing a header or footer, reversibly.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EVERY CHROME WRITE GOES THROUGH HERE
 *
 * Chrome used to be written with a bare `db.update(sites)`. Nothing recorded
 * what it replaced, so undo had nothing to restore — and because undo also
 * found a page revision to step back, it reported success while the swapped
 * header stayed exactly where it was. The client was told their change was
 * reverted and could see that it was not.
 *
 * Making the snapshot part of the write, in the same transaction, is what
 * stops that from being possible again: there is no way to change the header
 * without leaving a way back, because it is the same call.
 */

export type ChromeNodeJson = { type: string; props: Record<string, unknown> } | null;

export async function writeChromeWithHistory(opts: {
  siteId: string;
  userId: string;
  /** Omit a slot to leave it untouched. */
  header?: ChromeNodeJson;
  footer?: ChromeNodeJson;
  reason?: string;
}): Promise<void> {
  const { siteId, userId, header, footer, reason } = opts;

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error("That site doesn't exist.");

  await db.transaction(async (tx) => {
    // Snapshot BOTH slots before overwriting, even when only one is changing:
    // restoring has to put back the pair the client actually saw.
    await tx.insert(siteRevisions).values({
      siteId,
      headerSchemaJson: site.headerSchemaJson as Record<string, unknown> | null,
      footerSchemaJson: site.footerSchemaJson as Record<string, unknown> | null,
      kind: "undo",
      reason: reason?.slice(0, 500) ?? null,
      createdByUserId: userId,
    });

    /*
     * A new change forks history, so the redo stack goes.
     *
     * Same rule the page stack follows: anything redoable belonged to the
     * branch just abandoned, and keeping it would let redo jump to a header
     * that never followed from what is now on screen.
     */
    await tx.delete(siteRevisions).where(and(eq(siteRevisions.siteId, siteId), eq(siteRevisions.kind, "redo")));

    await tx
      .update(sites)
      .set({
        ...(header !== undefined ? { headerSchemaJson: header } : {}),
        ...(footer !== undefined ? { footerSchemaJson: footer } : {}),
      })
      .where(eq(sites.id, siteId));
  });
}
