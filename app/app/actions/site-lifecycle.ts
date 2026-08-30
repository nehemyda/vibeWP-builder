"use server";

import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  sites,
  sitePages,
  pageRevisions,
  siteRevisions,
  siteInstallations,
  siteMembers,
  siteTransfers,
  builderMessages,
  formDefinitions,
  formSubmissions,
  leads,
  businessProfiles,
} from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";

/**
 * Restoring and permanently removing a soft-deleted site.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY DELETE IS TWO STEPS
 *
 * Deleting a website destroys work nobody can reconstruct: the pages, the
 * revision history, the chat that produced them, and — the part that matters
 * most — the people who filled in its forms. A single confirm dialog is not
 * enough standing between a tired person and that.
 *
 * So `deletedAt` is the delete a client performs: the site stops working and
 * leaves every list, and everything is still there. Purging is a separate,
 * deliberate act from a separate screen, and it is the only thing here that
 * cannot be undone.
 */

/** Undoes a soft delete. The site returns exactly as it was. */
export async function restoreSiteAction(smbId: string) {
  const { site } = await requireSiteAccess(smbId);

  await db.update(sites).set({ deletedAt: null }).where(eq(sites.id, site.id));
  revalidatePath("/agency", "layout");
  return { ok: true as const };
}

export type PurgeCounts = Record<string, number>;

/**
 * What a purge would destroy, counted before anything is destroyed.
 *
 * Shown in the confirmation so the decision is made against real numbers
 * rather than an abstraction. "Delete this site?" and "delete this site, its
 * 4 pages and its 63 enquiries?" are different questions.
 */
export async function previewPurgeAction(smbId: string): Promise<PurgeCounts> {
  const { site } = await requireSiteAccess(smbId);

  const [pages, submissions, forms, messages, oldLeads] = await Promise.all([
    db.select({ id: sitePages.id }).from(sitePages).where(eq(sitePages.siteId, site.id)),
    db.select({ id: formSubmissions.id }).from(formSubmissions).where(eq(formSubmissions.siteId, site.id)),
    db.select({ id: formDefinitions.id }).from(formDefinitions).where(eq(formDefinitions.siteId, site.id)),
    db.select({ id: builderMessages.id }).from(builderMessages).where(eq(builderMessages.siteId, site.id)),
    db.select({ id: leads.id }).from(leads).where(eq(leads.siteId, site.id)),
  ]);

  return {
    pages: pages.length,
    submissions: submissions.length + oldLeads.length,
    forms: forms.length,
    "chat messages": messages.length,
  };
}

/**
 * Removes a site and everything belonging to it. Irreversible.
 *
 * Ordered children-before-parents, in ONE transaction. Deleting piecemeal
 * across several statements leaves a half-removed site behind if any of them
 * fails — rows pointing at a site that no longer exists, which no screen knows
 * how to render.
 *
 * The WordPress install on disk is deliberately NOT touched here: it lives
 * outside the database, removing it cannot be rolled back with the
 * transaction, and a client's own hosting is not ours to wipe as a side effect
 * of tidying our records.
 */
export async function purgeSiteAction(smbId: string) {
  const { site } = await requireSiteAccess(smbId);

  // Only ever a site the client has already chosen to delete.
  if (!site.deletedAt) {
    return { ok: false as const, error: "Delete the site first — this only removes deleted sites." };
  }

  await db.transaction(async (tx) => {
    const pageIds = (
      await tx.select({ id: sitePages.id }).from(sitePages).where(eq(sitePages.siteId, site.id))
    ).map((p) => p.id);

    if (pageIds.length > 0) {
      await tx.delete(pageRevisions).where(inArray(pageRevisions.pageId, pageIds));
    }
    await tx.delete(sitePages).where(eq(sitePages.siteId, site.id));
    await tx.delete(siteRevisions).where(eq(siteRevisions.siteId, site.id));
    await tx.delete(formSubmissions).where(eq(formSubmissions.siteId, site.id));
    await tx.delete(formDefinitions).where(eq(formDefinitions.siteId, site.id));
    await tx.delete(leads).where(eq(leads.siteId, site.id));
    await tx.delete(builderMessages).where(eq(builderMessages.siteId, site.id));
    await tx.delete(siteInstallations).where(eq(siteInstallations.siteId, site.id));
    await tx.delete(siteMembers).where(eq(siteMembers.siteId, site.id));
    /* Transfer history. Found by listing every foreign key to `sites` rather
       than by recalling them — the one I had forgotten would have made the
       final delete throw, rolling the whole purge back. */
    await tx.delete(siteTransfers).where(eq(siteTransfers.siteId, site.id));
    await tx
      .delete(businessProfiles)
      .where(and(eq(businessProfiles.ownerType, "site"), eq(businessProfiles.ownerId, site.id)));
    await tx.delete(sites).where(eq(sites.id, site.id));
  });

  revalidatePath("/agency", "layout");
  return { ok: true as const };
}
