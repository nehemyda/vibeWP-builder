"use server";

import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, sitePages, pageRevisions } from "@/lib/db/schema";
import { profiles } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { extractHeroContent } from "@/lib/builder-content";
import { logActivity } from "@/lib/activity";
import type { HeroContent } from "@/lib/mock-ai";

/**
 * Records who changed a client's page.
 *
 * Content edits were previously not logged at all. That was tolerable while
 * only the client and their agency could reach the builder; now that platform
 * admins can open it directly, an unlogged edit would be an edit with no
 * accountable author. The actor is always the real caller — never the site
 * owner — so an admin's change is identifiable as theirs.
 */
async function logPageChange(opts: {
  userId: string;
  siteId: string;
  action: "page.edited" | "page.created" | "page.reverted";
  slug: string;
  reason?: string;
}) {
  const [actor, site] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.id, opts.userId) }),
    db.query.sites.findFirst({ where: eq(sites.id, opts.siteId) }),
  ]);

  await logActivity({
    actorUserId: opts.userId,
    actorName: actor?.fullName ?? "Unknown",
    action: opts.action,
    targetType: "site",
    targetId: opts.siteId,
    targetLabel: site?.name ?? opts.siteId,
    metadata: { slug: opts.slug, ...(opts.reason ? { reason: opts.reason } : {}) },
  });
}

/**
 * Each page carries its own content, so switching pages in the builder can
 * repaint the canvas immediately instead of leaving the previous page's
 * content on screen.
 */
export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  content: HeroContent | null;
};

async function requireEditor(siteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }
  return user;
}

function labelFor(page: { slug: string; title: string | null }): string {
  if (page.title) return page.title;
  return page.slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function listPagesAction(siteId: string): Promise<PageSummary[]> {
  await requireEditor(siteId);
  const rows = await db
    .select()
    .from(sitePages)
    .where(eq(sitePages.siteId, siteId))
    .orderBy(sitePages.createdAt);
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: labelFor(p),
    content: extractHeroContent(p.schemaJson),
  }));
}

/**
 * Writes a page's schema, snapshotting whatever was there first.
 *
 * The snapshot is the point: generation replaces a page wholesale, so
 * without a prior revision a single mistaken prompt is unrecoverable.
 */
export async function savePageSchemaAction(opts: {
  siteId: string;
  slug: string;
  title?: string;
  schema: Record<string, unknown>;
  reason?: string;
}): Promise<{ pageId: string }> {
  const { siteId, slug, title, schema, reason } = opts;
  const user = await requireEditor(siteId);

  const existing = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, siteId), eq(sitePages.slug, slug)),
  });

  let pageId: string;

  if (existing) {
    await db.transaction(async (tx) => {
      // Snapshot BEFORE overwriting — this is what undo restores.
      await tx.insert(pageRevisions).values({
        pageId: existing.id,
        schemaJson: existing.schemaJson as Record<string, unknown>,
        kind: "undo",
        reason: reason?.slice(0, 500) ?? null,
        createdByUserId: user.id,
      });
      // A new edit forks history: anything that was redoable belonged to the
      // branch just abandoned, so keeping it would let redo jump to a state
      // that never followed from what is now on screen.
      await tx
        .delete(pageRevisions)
        .where(and(eq(pageRevisions.pageId, existing.id), eq(pageRevisions.kind, "redo")));
      await tx
        .update(sitePages)
        .set({ schemaJson: schema, ...(title ? { title } : {}) })
        .where(eq(sitePages.id, existing.id));
    });
    pageId = existing.id;
  } else {
    const [created] = await db
      .insert(sitePages)
      .values({ siteId, slug, title: title ?? null, schemaJson: schema })
      .returning();
    pageId = created.id;
  }

  await db.update(sites).set({ lastEditedAt: new Date() }).where(eq(sites.id, siteId));

  await logPageChange({
    userId: user.id,
    siteId,
    action: existing ? "page.edited" : "page.created",
    slug,
    reason,
  });

  return { pageId };
}

export type HistoryState = { canUndo: boolean; canRedo: boolean };

/**
 * How many steps are available in each direction, for enabling the buttons.
 *
 * Returning counts rather than trusting the client matters: two browser tabs
 * on the same page share one history, so a button enabled from stale state
 * would otherwise fail on click.
 */
export async function getHistoryStateAction(opts: {
  siteId: string;
  slug: string;
}): Promise<HistoryState> {
  const { siteId, slug } = opts;
  await requireEditor(siteId);

  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, siteId), eq(sitePages.slug, slug)),
  });
  if (!page) return { canUndo: false, canRedo: false };

  const rows = await db
    .select({ kind: pageRevisions.kind })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, page.id));

  return {
    canUndo: rows.some((r) => r.kind === "undo"),
    canRedo: rows.some((r) => r.kind === "redo"),
  };
}

/**
 * Moves one step through history.
 *
 * Undo and redo are the same operation with the stacks swapped, so they share
 * this implementation — which is the point. Written as two separate functions
 * they drifted apart, and the old undo ended up pushing its snapshot onto the
 * same undifferentiated pile it read from, which is what turned it into a
 * two-state toggle that could never reach an older version.
 */
async function stepHistory(
  opts: { siteId: string; slug: string },
  from: "undo" | "redo",
): Promise<{ ok: true; state: HistoryState } | { ok: false; error: string }> {
  const { siteId, slug } = opts;
  const to = from === "undo" ? "redo" : "undo";
  const user = await requireEditor(siteId);

  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, siteId), eq(sitePages.slug, slug)),
  });
  if (!page) return { ok: false, error: "That page doesn't exist." };

  const [restore] = await db
    .select()
    .from(pageRevisions)
    .where(and(eq(pageRevisions.pageId, page.id), eq(pageRevisions.kind, from)))
    .orderBy(desc(pageRevisions.createdAt))
    .limit(1);

  if (!restore) {
    return {
      ok: false,
      error:
        from === "undo"
          ? "There's nothing to undo on this page yet."
          : "There's nothing to redo — undo something first.",
    };
  }

  await db.transaction(async (tx) => {
    // The state being replaced becomes the one step available in the other
    // direction, which is what makes the move reversible.
    await tx.insert(pageRevisions).values({
      pageId: page.id,
      schemaJson: page.schemaJson as Record<string, unknown>,
      kind: to,
      reason: from === "undo" ? "Replaced by undo" : "Replaced by redo",
      createdByUserId: user.id,
    });
    await tx
      .update(sitePages)
      .set({ schemaJson: restore.schemaJson as Record<string, unknown> })
      .where(eq(sitePages.id, page.id));
    await tx.delete(pageRevisions).where(eq(pageRevisions.id, restore.id));
  });

  await logPageChange({ userId: user.id, siteId, action: "page.reverted", slug });

  return { ok: true, state: await getHistoryStateAction(opts) };
}

/** Steps one version back. */
export async function undoPageAction(opts: { siteId: string; slug: string }) {
  return stepHistory(opts, "undo");
}

/** Steps forward again, undoing an undo. */
export async function redoPageAction(opts: { siteId: string; slug: string }) {
  return stepHistory(opts, "redo");
}
