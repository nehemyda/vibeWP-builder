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
  plans,
  profiles,
} from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { planKeyOf } from "@/lib/billing";
import { logActivity } from "@/lib/activity";
import { exportToWordPressAction } from "@/app/actions/wordpress";

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

/*
 * Form-shaped wrappers.
 *
 * A server action bound to <form action={…}> must resolve to void; the ones
 * above return a result so callers can react to failure. Rather than weaken
 * those return types for the sake of the markup, the markup gets its own thin
 * entry points.
 */
export async function restoreSiteFormAction(smbId: string): Promise<void> {
  await restoreSiteAction(smbId);
}

export async function purgeSiteFormAction(smbId: string): Promise<void> {
  await purgeSiteAction(smbId);
}

/**
 * Moves a Vibe site to Vibe WordPress.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE ONLY WAY MODE CHANGES
 *
 * Mode is asked once, at intake, and ignored by every save afterwards — a
 * client fixing a typo in their phone number must not be able to orphan a
 * provisioned install and the monthly charge behind it. This is the
 * deliberate act that was carved out instead: it names what it costs, moves
 * the site, and provisions the WordPress in the same breath.
 *
 * ONE WAY ONLY. Going back would mean deciding what happens to an install the
 * client has been editing in wp-admin, and there is no answer to that which
 * is not somebody losing work. Until there is, downgrading is a conversation
 * with support rather than a button.
 *
 * WHAT DOES NOT MOVE: the content. Pages, header, footer, forms and leads are
 * all platform-side and unchanged by this — which is the whole argument for
 * letting someone start on Vibe and decide later.
 * ─────────────────────────────────────────────────────────────────────
 */
export type UpgradeResult =
  | { ok: true; url: string; provisioned: boolean }
  | { ok: false; error: string };

export async function upgradeSiteToWordPressAction(
  smbId: string,
  planKey: string,
): Promise<UpgradeResult> {
  const { user, site } = await requireSiteAccess(smbId);

  if (site.mode === "wordpress") {
    return { ok: false, error: "This site is already a Vibe WordPress site." };
  }

  /*
   * The plan has to be one that actually sells WordPress, and it is checked
   * BEFORE the mode is written — otherwise a refused upgrade would leave the
   * site stranded in WordPress mode with no install and no way back.
   */
  const catalogue = await db.select().from(plans);
  const chosen = catalogue.find((p) => p.key === planKeyOf(planKey));
  if (!chosen?.includesWordpress || !chosen.isActive) {
    const offered = catalogue
      .filter((p) => p.includesWordpress && p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => p.name);
    return {
      ok: false,
      error: offered.length
        ? `That plan doesn't include WordPress. Choose ${offered.join(", ")}.`
        : "No plan currently includes WordPress.",
    };
  }

  await db
    .update(sites)
    .set({ mode: "wordpress", plan: chosen.key, lastEditedAt: new Date() })
    .where(eq(sites.id, site.id));

  await logActivity({
    actorUserId: user.id,
    actorName: (await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) }))?.fullName ?? "Unknown",
    action: "site.mode_changed",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: { from: "vibe", to: "wordpress", plan: chosen.key },
  });

  /*
   * The existing export, unchanged. It reads the same schema it always did,
   * so there is nothing to migrate — and running it here means the upgrade
   * finishes with a WordPress the client can open, rather than with a flag
   * set and a second button to find.
   */
  const result = await exportToWordPressAction(smbId);
  if (!result.ok) {
    return {
      ok: false,
      error: `Switched to Vibe WordPress, but the install didn't finish: ${result.error} Try exporting again.`,
    };
  }

  return { ok: true, url: result.url, provisioned: result.provisioned };
}
