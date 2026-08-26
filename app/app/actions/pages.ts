"use server";

import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, sitePages, pageRevisions } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { extractHeroContent } from "@/lib/builder-content";
import type { HeroContent } from "@/lib/mock-ai";

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
    // Snapshot BEFORE overwriting — this is what undo restores.
    await db.insert(pageRevisions).values({
      pageId: existing.id,
      schemaJson: existing.schemaJson as Record<string, unknown>,
      reason: reason?.slice(0, 500) ?? null,
      createdByUserId: user.id,
    });
    await db
      .update(sitePages)
      .set({ schemaJson: schema, ...(title ? { title } : {}) })
      .where(eq(sitePages.id, existing.id));
    pageId = existing.id;
  } else {
    const [created] = await db
      .insert(sitePages)
      .values({ siteId, slug, title: title ?? null, schemaJson: schema })
      .returning();
    pageId = created.id;
  }

  await db.update(sites).set({ lastEditedAt: new Date() }).where(eq(sites.id, siteId));
  return { pageId };
}

/** Restores the most recent snapshot, and records the current state so undo is itself undoable. */
export async function undoPageAction(opts: {
  siteId: string;
  slug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { siteId, slug } = opts;
  const user = await requireEditor(siteId);

  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, siteId), eq(sitePages.slug, slug)),
  });
  if (!page) return { ok: false, error: "That page doesn't exist." };

  const previous = await db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, page.id))
    .orderBy(desc(pageRevisions.createdAt))
    .limit(1);

  if (previous.length === 0) return { ok: false, error: "There's nothing to undo on this page yet." };

  const restore = previous[0];

  await db.transaction(async (tx) => {
    // Keep the version we're replacing, so undo can be undone.
    await tx.insert(pageRevisions).values({
      pageId: page.id,
      schemaJson: page.schemaJson as Record<string, unknown>,
      reason: "Replaced by undo",
      createdByUserId: user.id,
    });
    await tx
      .update(sitePages)
      .set({ schemaJson: restore.schemaJson as Record<string, unknown> })
      .where(eq(sitePages.id, page.id));
    await tx.delete(pageRevisions).where(eq(pageRevisions.id, restore.id));
  });

  return { ok: true };
}
