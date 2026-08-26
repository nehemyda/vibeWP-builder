"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, sitePages, siteInstallations, profiles } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { schemaToGutenberg, requireAlt } from "@/lib/wp/blocks";
import { gutenbergToSchema } from "@/lib/wp/parse-blocks";
import { pushWouldOverwrite } from "@/lib/wp/sync";
import { detectSyncAction } from "@/app/actions/sync";
import {
  provisionSite,
  upsertPage,
  driverAvailable,
  ensureSiteServing,
  createAdminLoginUrl,
  sideloadImage,
} from "@/lib/wp/local-driver";
import { logActivity } from "@/lib/activity";

/**
 * The name of whoever actually performed the action.
 *
 * These logs used to record the site owner's name, or the site's own name, so
 * a platform admin provisioning or exporting a client's site showed up in the
 * activity log as the client. Now that admins can open the builder directly,
 * that would have hidden exactly the actions most worth attributing.
 */
async function actorNameFor(userId: string): Promise<string> {
  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  return actor?.fullName ?? "Unknown";
}

/**
 * Copies every external image in a page schema into the WordPress media
 * library, returning a schema whose image URLs point at the install itself.
 *
 * Runs after provisioning, since it needs somewhere to put the files. A
 * sideload that fails leaves the original URL in place: a hero pointing at
 * Pexels is worse than one pointing at local media, but far better than an
 * export that fails outright over a photo.
 */
async function sideloadSchemaImages(schema: unknown, installPath: string): Promise<unknown> {
  const nodes = (schema as { nodes?: Array<{ props?: Record<string, unknown> }> })?.nodes;
  if (!Array.isArray(nodes)) return schema;

  const rewritten = await Promise.all(
    nodes.map(async (node) => {
      const img = node?.props?.image as { url?: string; alt?: string } | undefined;
      if (!img?.url || !/^https?:\/\//i.test(img.url)) return node;

      // Alt is resolved before the sideload, not after, because WordPress
      // needs it for the attachment's own alt meta and its filename.
      const alt = requireAlt(img.alt, node.props?.heading as string | undefined);

      const local = await sideloadImage({ installPath, url: img.url, alt });
      if (!local) return node;

      return {
        ...node,
        props: {
          ...node.props,
          image: {
            ...img,
            url: local.url,
            alt,
            id: local.id,
            width: local.width ?? undefined,
            height: local.height ?? undefined,
          },
        },
      };
    }),
  );

  return { ...(schema as object), nodes: rewritten };
}

export type ExportResult =
  | { ok: true; url: string; provisioned: boolean; pageUrl: string }
  | { ok: false; error: string }
  /**
   * Refused because WordPress holds edits this push would destroy. Distinct
   * from a plain error so the caller can offer Pull or Overwrite rather than
   * just reporting failure.
   */
  | { ok: false; blocked: true; error: string; pages: Array<{ slug: string; state: string }> };

/**
 * Export to WordPress.
 *
 * First run provisions a real WordPress for this client — database, core,
 * the vibewp theme — and then pushes the content. Every later run only
 * pushes content to the install that already exists. Which of the two
 * happens is decided purely by whether a site_installations row exists,
 * so the button means the same thing every time.
 *
 * Returns a result object rather than throwing, because the builder needs
 * to show the reason in the chat when something goes wrong.
 *
 * @param force Proceed even when WordPress holds edits this would overwrite.
 *              Only ever set from an explicit user confirmation.
 */
export async function exportToWordPressAction(
  smbId: string,
  force = false,
): Promise<ExportResult> {
  const { user, site } = await requireSiteAccess(smbId);

  const available = await driverAvailable();
  if (!available.ok) {
    return { ok: false, error: available.reason ?? "WordPress tooling unavailable." };
  }

  /*
   * Refuse to overwrite work done in wp-admin.
   *
   * This used to push unconditionally: upsertPage() replaces post_content
   * wholesale, so an edit made in the WordPress editor was destroyed by the
   * next export with no warning and no mention of it anywhere. The check runs
   * before provisioning so a first-time export, which has nothing to conflict
   * with, is unaffected.
   */
  if (!force) {
    const detected = await detectSyncAction(smbId);
    if (detected.ok) {
      const risky = detected.pages.filter((p) => pushWouldOverwrite(p.state));
      if (risky.length > 0) {
        return {
          ok: false,
          blocked: true,
          error:
            risky.length === 1
              ? `The "${risky[0].title}" page has been edited in WordPress since the last sync. Pushing now would overwrite it.`
              : `${risky.length} pages have been edited in WordPress since the last sync. Pushing now would overwrite them.`,
          pages: risky.map((p) => ({ slug: p.slug, state: p.state })),
        };
      }
    }
    // A failed detection is not a reason to block: if WordPress is unreachable
    // there is nothing to overwrite yet, and the push will report its own error.
  }

  const allPages = await db
    .select()
    .from(sitePages)
    .where(eq(sitePages.siteId, site.id))
    .orderBy(sitePages.createdAt);

  // Only pages with real content are pushed; an empty page would blank a
  // live one on the WordPress side. This markup is a dry run purely for that
  // check — the markup actually pushed is re-serialized below, after images
  // have been sideloaded and their URLs rewritten.
  const exportable = allPages.filter((p) => schemaToGutenberg(p.schemaJson).length > 0);

  if (exportable.length === 0) {
    return {
      ok: false,
      error: "There's nothing to export yet — describe the business in the chat first.",
    };
  }

  let installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  const provisioned = !installation || installation.status !== "ready";

  try {
    if (provisioned) {
      // Record the attempt before doing the slow work, so a crash mid-way
      // leaves a visible 'provisioning'/'failed' row rather than nothing.
      if (!installation) {
        [installation] = await db
          .insert(siteInstallations)
          .values({ siteId: site.id, driver: "local", status: "provisioning" })
          .returning();
      } else {
        await db
          .update(siteInstallations)
          .set({ status: "provisioning", lastError: null })
          .where(eq(siteInstallations.id, installation.id));
      }

      const result = await provisionSite({
        smbId: site.smbId ?? site.id,
        siteName: site.name,
        adminEmail: `owner+${(site.smbId ?? site.id).toLowerCase()}@vibewp.local`,
      });

      await db
        .update(siteInstallations)
        .set({
          status: "ready",
          installPath: result.installPath,
          url: result.url,
          port: result.port,
          dbName: result.dbName,
          adminUser: result.adminUser,
          lastError: null,
        })
        .where(eq(siteInstallations.id, installation.id));

      installation = { ...installation, ...result, status: "ready" as const };

      await logActivity({
        actorUserId: user.id,
        actorName: await actorNameFor(user.id),
        action: "wordpress.provisioned",
        targetType: "site",
        targetId: site.id,
        targetLabel: site.name,
        metadata: { url: result.url },
      });
    }

    if (!installation?.installPath) {
      return { ok: false, error: "Installation record is missing its path." };
    }

    // A local server does not survive a reboot, so re-check on every export
    // rather than assuming the one started at provision time is still up.
    const serving = await ensureSiteServing({
      installPath: installation.installPath,
      port: installation.port ?? 0,
    });
    if (!serving.serving) {
      return {
        ok: false,
        error: serving.error ?? "Could not start the WordPress server for this site.",
      };
    }

    // Every page is reconciled by slug — created if absent, updated if not.
    let frontPageUrl = "";
    for (const page of exportable) {
      const isHome = page.slug === "home";
      const schema = await sideloadSchemaImages(page.schemaJson, installation.installPath);
      const markup = schemaToGutenberg(schema);
      const pushed = await upsertPage({
        installPath: installation.installPath,
        slug: page.slug,
        title: isHome ? site.name : (page.title ?? page.slug),
        blockMarkup: markup,
        asFrontPage: isHome,
      });
      if (isHome || !frontPageUrl) frontPageUrl = pushed.url;

      /*
       * Record what both sides now hold, so the next comparison has a base.
       *
       * schemaJson is updated too, to the sideloaded version: after export the
       * images genuinely live in the client's own media library, and leaving
       * VibeWP pointing at the stock CDN would make the two sides disagree
       * about the image on every future check.
       *
       * The base is stored as the PARSED form — what a read-back will actually
       * return — rather than the schema we hold, so unrepresentable fields
       * don't make a freshly-pushed page look diverged.
       */
      await db
        .update(sitePages)
        .set({
          schemaJson: schema as Record<string, unknown>,
          wpPostId: pushed.postId,
          syncedSchemaJson: (gutenbergToSchema(markup) ?? schema) as Record<string, unknown>,
          lastSyncedAt: new Date(),
        })
        .where(eq(sitePages.id, page.id));
    }
    const pushed = { url: frontPageUrl };

    await db
      .update(siteInstallations)
      .set({ lastExportedAt: new Date() })
      .where(eq(siteInstallations.siteId, site.id));

    await logActivity({
      actorUserId: user.id,
      actorName: await actorNameFor(user.id),
      action: "wordpress.exported",
      targetType: "site",
      targetId: site.id,
      targetLabel: site.name,
      metadata: { pageUrl: pushed.url, provisioned },
    });

    return { ok: true, url: installation.url ?? "", provisioned, pageUrl: pushed.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (installation) {
      await db
        .update(siteInstallations)
        .set({ status: "failed", lastError: message.slice(0, 1000) })
        .where(eq(siteInstallations.id, installation.id));
    }
    return { ok: false, error: message.split("\n")[0].slice(0, 300) };
  }
}

export type AdminLoginResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Returns a URL that opens wp-admin already signed in, so editing the site
 * in WordPress does not require a password nobody was ever shown.
 */
export async function openWordPressAdminAction(smbId: string): Promise<AdminLoginResult> {
  const { site } = await requireSiteAccess(smbId);

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  if (!installation?.installPath || !installation.url) {
    return { ok: false, error: "Export to WordPress first — there's no site yet." };
  }

  const serving = await ensureSiteServing({
    installPath: installation.installPath,
    port: installation.port ?? 0,
  });
  if (!serving.serving) {
    return { ok: false, error: serving.error ?? "Could not start the WordPress server." };
  }

  const loginUrl = await createAdminLoginUrl({
    installPath: installation.installPath,
    url: installation.url,
  });
  if (!loginUrl) return { ok: false, error: "Could not create a login link." };

  return { ok: true, url: loginUrl };
}

export type PublishResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Publish — flips the site from draft to live.
 *
 * Deliberately requires an export first: marking a site live when no
 * WordPress exists behind it would be a lie.
 */
export async function publishSiteAction(smbId: string): Promise<PublishResult> {
  const { user, site } = await requireSiteAccess(smbId);

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });

  if (!installation || installation.status !== "ready") {
    return { ok: false, error: "Export to WordPress first — there's no site to publish yet." };
  }

  await db.update(sites).set({ status: "live" }).where(eq(sites.id, site.id));

  await logActivity({
    actorUserId: user.id,
    actorName: await actorNameFor(user.id),
    action: "site.published",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: { url: installation.url },
  });

  return { ok: true, url: installation.url ?? "" };
}
