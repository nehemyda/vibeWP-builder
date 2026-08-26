"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, sitePages, siteInstallations, profiles } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { schemaToGutenberg } from "@/lib/wp/blocks";
import { provisionSite, upsertPage, driverAvailable } from "@/lib/wp/local-driver";
import { logActivity } from "@/lib/activity";

export type ExportResult =
  | { ok: true; url: string; provisioned: boolean; pageUrl: string }
  | { ok: false; error: string };

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
 */
export async function exportToWordPressAction(smbId: string): Promise<ExportResult> {
  const { user, site } = await requireSiteAccess(smbId);

  const available = await driverAvailable();
  if (!available.ok) {
    return { ok: false, error: available.reason ?? "WordPress tooling unavailable." };
  }

  const page = await db.query.sitePages.findFirst({ where: eq(sitePages.siteId, site.id) });
  const blockMarkup = schemaToGutenberg(page?.schemaJson);
  if (!blockMarkup) {
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

      const owner = await db.query.profiles.findFirst({
        where: eq(profiles.id, site.ownerUserId),
      });

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
        actorName: owner?.fullName ?? "Unknown",
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

    const pushed = await upsertPage({
      installPath: installation.installPath,
      slug: page?.slug ?? "home",
      title: site.name,
      blockMarkup,
      asFrontPage: (page?.slug ?? "home") === "home",
    });

    await db
      .update(siteInstallations)
      .set({ lastExportedAt: new Date() })
      .where(eq(siteInstallations.siteId, site.id));

    await logActivity({
      actorUserId: user.id,
      actorName: site.name,
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
    actorName: site.name,
    action: "site.published",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: { url: installation.url },
  });

  return { ok: true, url: installation.url ?? "" };
}
