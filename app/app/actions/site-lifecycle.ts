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
import { detectSyncAction, type PageSyncReport } from "@/app/actions/sync";
import { adoptLogo, adoptSchemaImages } from "@/lib/media/adopt";
import { sitesHost, vibeSiteUrl } from "@/lib/render/hosting";
import { claimVibeSubdomain } from "@/lib/render/claim-subdomain";
import { ensureSiteServing, stopSiteServing } from "@/lib/wp/local-driver";
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
 * REVERSIBLE, but not symmetrically. downgradeSiteToVibeAction moves a site
 * back. This once called that a conversation with support, on the grounds
 * that going back risks losing work — a weak argument against the case that
 * actually happens, which is a client who stops paying. Coming down refuses
 * while WordPress holds edits that exist nowhere else, and brings the
 * photographs home before anything moves. Going up is a purchase; coming down
 * is a migration, and they are not the same shape.
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

/**
 * What a downgrade would cost, without starting one.
 *
 * Read-only and separate from the action deliberately: someone deciding
 * whether to move a site off WordPress should be able to find out what it
 * would lose before committing to anything. A confirmation dialog that only
 * appears once you have already pressed the button is a worse version of this.
 */
export type DowngradePreflight = {
  /** False when the site is not a WordPress site at all. */
  applicable: boolean;
  /** Pages whose WordPress copy has moved on. Their edits exist nowhere else. */
  blocking: Array<{ slug: string; title: string; state: string; description: string }>;
  /** Blocks wp-admin added that our schema cannot represent. Dropped if this proceeds. */
  losing: Array<{ slug: string; blocks: string[] }>;
  /** True when nothing blocks and nothing would be lost. */
  clean: boolean;
  /** Set when WordPress could not be reached to compare at all. */
  error?: string;
};

/** Sync states that mean "WordPress holds something we do not". */
const BLOCKING_STATES = new Set(["wp_ahead", "conflict", "never_synced"]);

export async function downgradePreflightAction(smbId: string): Promise<DowngradePreflight> {
  const { site } = await requireSiteAccess(smbId);

  const empty = { blocking: [], losing: [], clean: false };
  if (site.mode !== "wordpress") return { applicable: false, ...empty };

  /*
   * The same comparison the builder's sync banner runs. Reusing it means a
   * downgrade cannot disagree with what the client was already being shown
   * about their own pages.
   */
  const report = await detectSyncAction(smbId);
  if (!report.ok) return { applicable: true, ...empty, error: report.error };

  const blocking = report.pages
    .filter((p: PageSyncReport) => BLOCKING_STATES.has(p.state))
    .map((p: PageSyncReport) => ({ slug: p.slug, title: p.title, state: p.state, description: p.description }));

  const losing = report.pages
    .filter((p: PageSyncReport) => p.unmodelled.length > 0)
    .map((p: PageSyncReport) => ({ slug: p.slug, blocks: p.unmodelled }));

  return {
    applicable: true,
    blocking,
    losing,
    clean: blocking.length === 0 && losing.length === 0,
  };
}

/**
 * Moves a Vibe WordPress site back to Vibe hosting.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, HAVING SAID IT WOULD NOT
 *
 * The upgrade was written one-way, on the grounds that going back risks
 * losing work. That is a weak argument against the case that actually
 * happens: a client stops paying for WordPress. Without this, such a site has
 * no end state — its next export is refused by the entitlement gate and
 * nothing moves it anywhere. It is stranded on a tier nobody is paying for.
 *
 * So the answer is not "never", it is "not while it would lose something
 * quietly". Every refusal below is that rule.
 *
 * WHY THE ORDER IS FIXED
 *
 * Export rewrote this site's stored image URLs to its WordPress media
 * library. Those images have to come back into our own library BEFORE the
 * mode changes, and while that install is still serving — afterwards there is
 * nothing to fetch from. A downgrade that flipped the mode first and then
 * failed would leave a Vibe site whose photographs live on a WordPress it no
 * longer uses.
 *
 * WHAT IS NOT TOUCHED: the install, its database and its uploads. Stopping it
 * from serving is as far as this goes. A client's own hosting is not ours to
 * delete, which is the same rule soft-delete already follows.
 * ─────────────────────────────────────────────────────────────────────
 */
export type DowngradeResult =
  | { ok: true; url: string; pagesMoved: number }
  | { ok: false; error: string; preflight?: DowngradePreflight };

export async function downgradeSiteToVibeAction(
  smbId: string,
  planKey: string,
  /** Proceed even though listed blocks will be dropped. Never defaulted on. */
  acceptLoss = false,
): Promise<DowngradeResult> {
  const { user, site } = await requireSiteAccess(smbId);

  if (site.mode !== "wordpress") {
    return { ok: false, error: "This site is already on Vibe hosting." };
  }
  if (!sitesHost()) {
    return { ok: false, error: "Platform hosting isn't configured, so there's nowhere to move this to." };
  }

  const preflight = await downgradePreflightAction(smbId);
  if (preflight.error) {
    return {
      ok: false,
      error: `Couldn't compare against WordPress, so this can't be done safely yet: ${preflight.error}`,
      preflight,
    };
  }
  if (preflight.blocking.length > 0) {
    const names = preflight.blocking.map((p) => p.title || p.slug).join(", ");
    return {
      ok: false,
      error:
        `WordPress holds newer edits to ${names}, and they exist nowhere else. ` +
        "Pull those in first, then move the site.",
      preflight,
    };
  }
  if (preflight.losing.length > 0 && !acceptLoss) {
    const blocks = [...new Set(preflight.losing.flatMap((p) => p.blocks))].join(", ");
    return {
      ok: false,
      error: `Moving this site drops blocks Vibe can't show: ${blocks}. Confirm to proceed without them.`,
      preflight,
    };
  }

  /* The plan is checked before anything moves, for the same reason the upgrade
     checks it first: a refusal after the mode changed would strand the site. */
  const catalogue = await db.select().from(plans);
  const chosen = catalogue.find((p) => p.key === planKeyOf(planKey));
  if (!chosen || !chosen.isActive) return { ok: false, error: "That plan isn't available." };

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });

  /*
   * Bring the photographs home, first, while WordPress can still answer.
   *
   * useSourceFallback because an install that will not wake still leaves the
   * original stock address on each image — a slightly older copy is far
   * better than a broken one.
   */
  if (installation?.installPath) {
    await ensureSiteServing({ installPath: installation.installPath, port: installation.port ?? 0 });
  }

  const pages = await db.select().from(sitePages).where(eq(sitePages.siteId, site.id));
  let pagesMoved = 0;
  for (const p of pages) {
    const { changed, schema } = await adoptSchemaImages(site.id, p.schemaJson, {
      useSourceFallback: true,
    });
    if (!changed) continue;
    await db.update(sitePages).set({ schemaJson: schema }).where(eq(sitePages.id, p.id));
    pagesMoved += 1;
  }

  const profile = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerId, site.id), eq(businessProfiles.ownerType, "site")),
  });
  await adoptLogo(site.id, profile?.logoUrl);

  /* Only now does the site actually move. */
  const subdomain = site.vibeSubdomain ?? (await claimVibeSubdomain(site));
  if (!subdomain) return { ok: false, error: "Couldn't find an available address for this site." };

  await db
    .update(sites)
    .set({ mode: "vibe", plan: chosen.key, vibeSubdomain: subdomain, lastEditedAt: new Date() })
    .where(eq(sites.id, site.id));

  /* Stopped, not deleted. The install stays on disk exactly as it is. */
  if (installation?.port) await stopSiteServing(installation.port);

  await logActivity({
    actorUserId: user.id,
    actorName: (await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) }))?.fullName ?? "Unknown",
    action: "site.mode_changed",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: {
      from: "wordpress",
      to: "vibe",
      plan: chosen.key,
      pagesMoved,
      blocksDropped: preflight.losing.flatMap((p) => p.blocks),
    },
  });

  return { ok: true, url: vibeSiteUrl(subdomain) ?? "", pagesMoved };
}
