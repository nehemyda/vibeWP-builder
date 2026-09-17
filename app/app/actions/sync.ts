"use server";

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePages, siteInstallations } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { extractHeroContent } from "@/lib/builder-content";
import { gutenbergToSchema, detectUnmodelledBlocks } from "@/lib/wp/serialize";
import { schemaToGutenberg } from "@/lib/wp/serialize";
import {
  classifyPage,
  describeState,
  projectForSync,
  type PageSyncState,
} from "@/lib/wp/sync";
import {
  driverAvailable,
  ensureSiteServing,
  readPageContent,
  readEditLocks,
  type WpEditLock,
} from "@/lib/wp/local-driver";
import { savePageSchemaAction } from "@/app/actions/pages";

/**
 * VibeWP-side schemas are compared in their WordPress-representable form, so
 * fields Gutenberg cannot store never register as a difference. See
 * projectForSync().
 */
const project = (schema: unknown) => projectForSync(schema, schemaToGutenberg, gutenbergToSchema);

export type PageSyncReport = {
  slug: string;
  title: string;
  state: PageSyncState;
  description: string;
  /** Headings from each side, so the UI can show what actually differs. */
  wpHeading: string | null;
  vibeHeading: string | null;
  wpModifiedAt: string | null;
  /** Blocks added in wp-admin that our schema cannot represent. */
  unmodelled: string[];
};

export type SyncReport =
  | { ok: true; pages: PageSyncReport[] }
  | { ok: false; error: string };

/**
 * Compares every page against WordPress without changing anything.
 *
 * Read-only by design: this runs when the builder opens, and a detection pass
 * that mutated content would be the opposite of what the conflict rule is for.
 */
export async function detectSyncAction(smbId: string): Promise<SyncReport> {
  const { site } = await requireSiteAccess(smbId);

  // A Vibe site has no WordPress, so there is nothing to compare against.
  // Answered before the query rather than after, because the builder polls
  // this and an install that cannot exist should cost nothing to rule out.
  if (site.mode === "vibe") return { ok: true, pages: [] };

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  if (!installation?.installPath || installation.status !== "ready") {
    return { ok: true, pages: [] }; // Nothing exported yet — nothing to reconcile.
  }

  const available = await driverAvailable();
  if (!available.ok) return { ok: false, error: available.reason ?? "WordPress tooling unavailable." };

  // A local install is often asleep; without this every page reads as missing.
  const serving = await ensureSiteServing({
    installPath: installation.installPath,
    port: installation.port ?? 0,
  });
  if (!serving.serving) {
    return { ok: false, error: serving.error ?? "Could not reach this site's WordPress." };
  }

  const pages = await db
    .select()
    .from(sitePages)
    .where(eq(sitePages.siteId, site.id))
    .orderBy(sitePages.createdAt);

  const report: PageSyncReport[] = [];

  for (const page of pages) {
    const wp = await readPageContent({
      installPath: installation.installPath,
      slug: page.slug,
      asFrontPage: page.slug === "home",
    });

    const wpSchema = wp ? gutenbergToSchema(wp.content) : null;
    const state = classifyPage({
      wpPostId: wp?.postId ?? page.wpPostId ?? null,
      wpSchema,
      vibeSchema: project(page.schemaJson),
      baseSchema: page.syncedSchemaJson ? project(page.syncedSchemaJson) : null,
    });

    report.push({
      slug: page.slug,
      title: page.title ?? page.slug,
      state,
      description: describeState(state),
      wpHeading: wpSchema ? (extractHeroContent(wpSchema)?.heading ?? null) : null,
      vibeHeading: extractHeroContent(page.schemaJson)?.heading ?? null,
      wpModifiedAt: wp?.modifiedAt ?? null,
      unmodelled: wp ? detectUnmodelledBlocks(wp.content) : [],
    });
  }

  return { ok: true, pages: report };
}

export type PullResult = { ok: true; heading: string | null } | { ok: false; error: string };

/**
 * Brings a WordPress edit into VibeWP.
 *
 * Two things make this non-destructive. It routes through
 * savePageSchemaAction, so the incoming version lands as a normal undo step —
 * a WordPress edit is as reversible as a chat one. And it MERGES over the
 * existing props rather than replacing them, because the parser can only
 * recover what WordPress is able to store: photographer credits, for one, have
 * nowhere to live in a block and would otherwise be silently erased on every
 * pull.
 */
export async function pullFromWordPressAction(opts: {
  smbId: string;
  slug: string;
}): Promise<PullResult> {
  const { smbId, slug } = opts;
  const { site } = await requireSiteAccess(smbId);

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  if (!installation?.installPath) return { ok: false, error: "This site has no WordPress install." };

  const serving = await ensureSiteServing({
    installPath: installation.installPath,
    port: installation.port ?? 0,
  });
  if (!serving.serving) return { ok: false, error: serving.error ?? "Could not reach WordPress." };

  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, site.id), eq(sitePages.slug, slug)),
  });
  if (!page) return { ok: false, error: "That page doesn't exist in VibeWP." };

  const wp = await readPageContent({
    installPath: installation.installPath,
    slug,
    asFrontPage: slug === "home",
  });
  if (!wp) return { ok: false, error: "That page doesn't exist in WordPress." };

  const incoming = gutenbergToSchema(wp.content);
  if (!incoming) {
    return {
      ok: false,
      error:
        "Couldn't read that page's layout from WordPress — it may have been rebuilt with blocks VibeWP doesn't model yet.",
    };
  }

  const merged = mergeSchemas(page.schemaJson, incoming);

  // Lands as an undo step, and clears any redo branch, like any other edit.
  await savePageSchemaAction({
    siteId: site.id,
    slug,
    schema: merged as Record<string, unknown>,
    reason: "Pulled from WordPress",
  });

  await db
    .update(sitePages)
    .set({
      wpPostId: wp.postId,
      // Both sides now hold this; it becomes the base for the next comparison.
      syncedSchemaJson: merged as Record<string, unknown>,
      lastSyncedAt: new Date(),
    })
    .where(eq(sitePages.id, page.id));

  return { ok: true, heading: extractHeroContent(merged)?.heading ?? null };
}

/**
 * Whether these two image records describe the same photo.
 *
 * Cannot be a URL comparison, which is the mistake this replaces: export
 * sideloads the file into the client's media library, so the URL deliberately
 * changes from the stock CDN to a local one. Matching on URL therefore never
 * held, and every pull silently dropped the photographer credit.
 *
 * Alt text is the stable identifier across that move: it is written to the
 * attachment's own alt field on sideload and comes back unchanged on read. If
 * the alt HAS changed, the client most likely replaced the image — in which case
 * inheriting the old credit would be worse than losing it.
 */
function sameImage(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.url && a.url === b.url) return true;
  const altA = typeof a.alt === "string" ? a.alt.trim() : "";
  const altB = typeof b.alt === "string" ? b.alt.trim() : "";
  return altA.length > 0 && altA === altB;
}

/**
 * Overlays the parsed WordPress props onto what VibeWP already had, so fields
 * WordPress cannot represent survive the trip.
 */
function mergeSchemas(existing: unknown, incoming: Record<string, unknown>): unknown {
  type Node = { type?: string; props?: Record<string, unknown> };
  const oldNodes = (existing as { nodes?: Node[] })?.nodes ?? [];
  const newNodes = (incoming as { nodes?: Node[] })?.nodes ?? [];

  return {
    ...incoming,
    nodes: newNodes.map((node) => {
      const previous = oldNodes.find((n) => n.type === node.type);
      if (!previous?.props) return node;

      const oldImage = previous.props.image as Record<string, unknown> | undefined;
      const newImage = node.props?.image as Record<string, unknown> | undefined;

      return {
        ...node,
        props: {
          ...previous.props,
          ...node.props,
          ...(newImage && oldImage && sameImage(oldImage, newImage)
            ? { image: { ...oldImage, ...newImage } }
            : {}),
        },
      };
    }),
  };
}

/**
 * Resolves a conflict by declaring one side the winner.
 *
 * Keeping WordPress pulls it in. Keeping VibeWP does NOT push immediately — it
 * records the current WordPress state as the base, which downgrades the
 * conflict to "vibe_ahead" so an ordinary push is then unblocked. That keeps
 * one action doing one thing, and leaves the actual overwrite an explicit step.
 */
export async function resolveConflictAction(opts: {
  smbId: string;
  slug: string;
  keep: "wordpress" | "vibewp";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { smbId, slug, keep } = opts;

  if (keep === "wordpress") {
    const pulled = await pullFromWordPressAction({ smbId, slug });
    return pulled.ok ? { ok: true } : { ok: false, error: pulled.error };
  }

  const { site } = await requireSiteAccess(smbId);
  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  if (!installation?.installPath) return { ok: false, error: "This site has no WordPress install." };

  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, site.id), eq(sitePages.slug, slug)),
  });
  if (!page) return { ok: false, error: "That page doesn't exist." };

  const wp = await readPageContent({
    installPath: installation.installPath,
    slug,
    asFrontPage: slug === "home",
  });
  const wpSchema = wp ? gutenbergToSchema(wp.content) : null;

  await db
    .update(sitePages)
    .set({
      wpPostId: wp?.postId ?? page.wpPostId,
      // Accept WordPress's current state as the base WITHOUT taking its content:
      // the conflict is acknowledged, VibeWP's version stands, and the next push
      // is a plain vibe_ahead write.
      syncedSchemaJson: (wpSchema ?? page.syncedSchemaJson) as Record<string, unknown>,
      lastSyncedAt: new Date(),
    })
    .where(eq(sitePages.id, page.id));

  return { ok: true };
}

export type EditLockReport =
  | { ok: true; locks: WpEditLock[] }
  | { ok: false; error: string };

/**
 * Whether anyone has this site open in the WordPress editor right now.
 *
 * Polled by the builder rather than checked once at open. The previous model
 * detected WordPress state exactly once per page load, which meant a client
 * could work for an hour in a builder that had stopped looking — the whole
 * point of a lock is that it appears while you are already sitting there.
 *
 * Deliberately cheap: one WP-CLI call, no page-content reads and no diffing,
 * because this runs on a timer and the expensive comparison does not have to.
 */
export async function detectEditLocksAction(smbId: string): Promise<EditLockReport> {
  const { site } = await requireSiteAccess(smbId);

  // No WordPress, so nobody can be editing in one. This is the hot path —
  // polled every five seconds while locked — so a Vibe site exits first.
  if (site.mode === "vibe") return { ok: true, locks: [] };

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  // Nothing exported yet, so there is no WordPress for anyone to be editing in.
  if (!installation?.installPath || installation.status !== "ready") {
    return { ok: true, locks: [] };
  }

  /*
   * No ensureSiteServing() here, unlike detectSyncAction.
   *
   * Waking a sleeping PHP server takes seconds, and this runs every twenty.
   * A site nobody has visited is also a site nobody is editing, so the honest
   * answer for an asleep install is "no locks" — reached without the wait.
   */
  const available = await driverAvailable();
  if (!available.ok) return { ok: false, error: available.reason ?? "WordPress tooling unavailable." };

  return { ok: true, locks: await readEditLocks(installation.installPath) };
}
