"use server";


import { imagePaths, writeImage } from "@/lib/design/image-map";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, sitePages, siteInstallations, profiles, businessProfiles, platformPlugins } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { requireAlt } from "@/lib/wp/blocks";
import { withStaticForms } from "@/lib/forms/inject";
import { schemaToGutenberg, sectionToTemplatePart, withSiteLogo } from "@/lib/wp/serialize";
import { resolveBrandColors } from "@/lib/brand/palettes";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";
import { detectBusinessDriftAction } from "@/app/actions/business-sync";
import { gutenbergToSchema } from "@/lib/wp/serialize";
import { pushWouldLose } from "@/lib/wp/sync";
import { detectSyncAction } from "@/app/actions/sync";
import {
  provisionSite,
  upsertPage,
  driverAvailable,
  ensureSiteServing,
  ensureSitePlugins,
  createAdminLoginUrl,
  sideloadImage,
  syncTheme,
  writeTemplatePart,
  writeThemePalette,
  writeBusinessOptions,
  setSiteLogo,
} from "@/lib/wp/local-driver";
import { logActivity } from "@/lib/activity";
import { wordpressEntitlement } from "@/lib/billing";
import { sitesHost, vibeSiteUrl } from "@/lib/render/hosting";
import { resolveTokens } from "@/lib/design/resolve";
import { getPlatformSettings } from "@/lib/platform-settings";
import { claimVibeSubdomain } from "@/lib/render/claim-subdomain";
import { adoptLogo, adoptSchemaImages } from "@/lib/media/adopt";

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
async function sideloadSchemaImages(
  schema: unknown,
  installPath: string,
  /** Null before the install has a URL; then nothing is local yet anyway. */
  siteUrl: string | null,
): Promise<unknown> {
  const nodes = (schema as { nodes?: Array<{ props?: Record<string, unknown> }> })?.nodes;
  if (!Array.isArray(nodes)) return schema;

  const rewritten = await Promise.all(
    nodes.map(async (node) => {
      /*
       * Every photograph in the node, not just props.image.
       *
       * Galleries keep theirs at items.N.image, alternating content at
       * rows.N.image, the featured service at featured.image. Walking only
       * props.image left nine placements across four section families
       * pointing at Pexels on the client's own live site.
       */
      let props = node?.props;
      if (!props) return node;

      for (const { path, image } of imagePaths(props)) {
        if (!/^https?:\/\//i.test(image.url)) continue;
        /*
         * Already in this install's media library. Sideloading it again would
         * make a duplicate attachment on every publish.
         */
        if (siteUrl && image.url.startsWith(siteUrl)) continue;

        // Alt is resolved before the sideload, not after, because WordPress
        // needs it for the attachment's own alt meta and its filename.
        const alt = requireAlt(image.alt, props.heading as string | undefined);
        const local = await sideloadImage({ installPath, url: image.url, alt });
        // A sideload that fails leaves the original URL: a hero pointing at
        // Pexels is worse than one pointing at local media, and far better
        // than an export that fails outright over a photo.
        if (!local) continue;

        props = writeImage(props, path, {
          url: local.url,
          alt,
          id: local.id,
          width: local.width ?? undefined,
          height: local.height ?? undefined,
        });
      }

      return { ...node, props };
    }),
  );

  return { ...(schema as object), nodes: rewritten };
}

export type ExportResult =
  | {
      ok: true;
      url: string;
      provisioned: boolean;
      pageUrl: string;
      /**
       * Plugins on the checklist that could not be installed.
       *
       * Carried on a SUCCESSFUL export deliberately: the site published, and
       * losing it over a plugin would be the worse trade — but afterwards
       * "did not install" and "installed" look identical, so this is the only
       * moment anyone can be told.
       */
      pluginFailures?: Array<{ name: string; reason: string }>;
    }
  | { ok: false; error: string }
  /**
   * Refused because WordPress holds edits this push would destroy. Distinct
   * from a plain error so the caller can offer Pull or Overwrite rather than
   * just reporting failure.
   */
  | { ok: false; blocked: true; error: string; pages: Array<{ slug: string; state: string }> }
  /**
   * Refused because this site is not entitled to WordPress — it is a Vibe
   * site, or its plan does not include one. Distinct from a plain error
   * because the answer is a decision to make, not a fault to report.
   */
  | { ok: false; upgrade: true; error: string; upgradeTo: string[] };

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

  /*
   * Entitlement before tooling.
   *
   * Deliberately the first check after access: a client who is not buying
   * WordPress should be told that, not told our PHP binary is missing. This
   * is the single chokepoint for every provision and every push, which is
   * why the paywall is here and nowhere else.
   */
  const entitled = await wordpressEntitlement(site);
  if (!entitled.allowed) {
    return { ok: false, upgrade: true, error: entitled.reason, upgradeTo: entitled.upgradeTo };
  }

  const available = await driverAvailable();
  if (!available.ok) {
    return { ok: false, error: available.reason ?? "WordPress tooling unavailable." };
  }

  /*
   * Refresh the theme BEFORE the content guard below.
   *
   * Deliberate ordering. The guard can refuse a content push because the
   * client edited a page in wp-admin — but the theme is platform-owned, and
   * updating it touches no content, so a content conflict must not also
   * strand a stylesheet fix on that site.
   *
   * Placing this after the guard is exactly the bug that was caught here: a
   * blocked export left the site on the stylesheet it was provisioned with,
   * while the builder preview showed the current one.
   */
  const existing = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });
  if (existing?.installPath && existing.status === "ready") {
    try {
      await syncTheme(existing.installPath);
    } catch (err) {
      // Never fatal: an out-of-date stylesheet is far better than a failed export.
      console.warn("[wp] theme sync failed", err);
    }
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
      const risky = detected.pages.filter((p) => pushWouldLose(p));
      if (risky.length > 0) {
        /*
         * Two reasons, two different answers, so they are worded apart.
         *
         * An edited page can be pulled in and then pushed. A page carrying a
         * block we cannot model cannot: the pull drops it too, so the only way
         * to keep it is not to push that page. Telling someone to "pull first"
         * there would be advice that destroys the thing it claims to save.
         */
        const unmodelled = risky.filter((p) => p.unmodelled.length > 0);
        const edited = risky.filter((p) => p.unmodelled.length === 0);

        const blocks = [...new Set(unmodelled.flatMap((p) => p.unmodelled))];
        const parts: string[] = [];

        if (edited.length) {
          parts.push(
            edited.length === 1
              ? `The "${edited[0].title}" page has been edited in WordPress since the last sync. Pushing now would overwrite it.`
              : `${edited.length} pages have been edited in WordPress since the last sync. Pushing now would overwrite them.`,
          );
        }
        if (unmodelled.length) {
          parts.push(
            `${unmodelled.length === 1 ? `The "${unmodelled[0].title}" page has` : `${unmodelled.length} pages have`} ` +
              `content VibeWP cannot represent (${blocks.join(", ")}). Pushing would delete it, and pulling ` +
              "would too — keep it by leaving those pages alone, or overwrite to lose it.",
          );
        }

        return {
          ok: false,
          blocked: true,
          error: parts.join(" "),
          pages: risky.map((p) => ({ slug: p.slug, state: p.state })),
        };
      }
    }
    /*
     * The same guard for the business details.
     *
     * Export writes these options unconditionally, so without this a client who
     * corrected their phone number on the live site had it silently replaced by
     * the next push — the exact failure the page guard above was built to stop,
     * on data where being wrong means a customer cannot reach the business.
     */
    const detailDrift = await detectBusinessDriftAction(site.id);
    if (detailDrift.ok && detailDrift.drift.length > 0) {
      const names = detailDrift.drift.map((d) => d.label.toLowerCase());
      return {
        ok: false,
        blocked: true,
        error:
          `${names.length === 1 ? "The " + names[0] : names.join(", ")} ` +
          `${names.length === 1 ? "was" : "were"} changed in WordPress since the last export. ` +
          `Pushing now would overwrite ${names.length === 1 ? "it" : "them"} — open Business details in the builder to take the WordPress values first.`,
        pages: [],
      };
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

    /*
     * The platform's plugin checklist.
     *
     * After the server is up and before any content is pushed, so a fresh
     * install has its SEO and security plugins in place by the time a client
     * first opens wp-admin. Runs on every export, not only at provision — see
     * ensureSitePlugins for why.
     */
    const checklist = await db
      .select()
      .from(platformPlugins)
      .where(eq(platformPlugins.isActive, true))
      .orderBy(platformPlugins.sortOrder);

    /*
     * Skipped entirely when this install already has exactly this checklist.
     *
     * The skip is the difference between a feature and a tax. Applying the
     * list is one wp-cli call per row, and wp-cli on a site carrying a
     * firewall and a page cache takes tens of seconds per call because each
     * invocation boots WordPress with them loaded — measured at 130s to
     * re-apply four rows that were already there. Nobody would accept that on
     * every export, and the alternative of only ever applying at provision
     * would mean a plugin added later never reaching sites that already exist.
     *
     * The signature covers what would actually change an install: which
     * plugins, and whether each is activated.
     */
    const signature = checklist.map((p) => `${p.slug}:${p.autoActivate ? 1 : 0}`).join(",");
    const needsPlugins = checklist.length > 0 && installation.pluginsSignature !== signature;

    const pluginReport = needsPlugins
      ? await ensureSitePlugins({
          installPath: installation.installPath,
          plugins: checklist.map((p) => ({
            slug: p.slug,
            name: p.name,
            autoActivate: p.autoActivate,
          })),
        })
      : { installed: [], failed: [] };

    /*
     * Recorded only when every row landed. A partial apply must be retried on
     * the next export rather than remembered as done — otherwise one plugin
     * that failed while wordpress.org was unreachable would be missing
     * permanently, and nothing would ever look for it again.
     */
    if (needsPlugins && pluginReport.failed.length === 0) {
      await db
        .update(siteInstallations)
        .set({ pluginsSignature: signature })
        .where(eq(siteInstallations.siteId, site.id));
    }

    /*
     * Business details into WordPress options.
     *
     * The theme resolves {{phone}} and friends from these at render time, so
     * this is what makes the details editable on the WordPress side instead of
     * frozen into each page at the moment it was generated.
     */
    try {
      const ctx = await loadBusinessContext(site.id);
      if (ctx) {
        const facts = contactFactsFor(ctx);
        await writeBusinessOptions({
          installPath: installation.installPath,
          values: {
            business_name: ctx.businessName,
            phone: facts.phone ?? "",
            email: facts.email ?? "",
            address: facts.address ?? "",
            hours: facts.hours ?? "",
          },
        });
      }
    } catch (err) {
      // Non-fatal: the details are also present in the page content itself.
      console.warn("[wp] could not write business options", err);
    }

    /*
     * The logo into the media library, and set as the site logo.
     *
     * Before the template parts, because whether a logo exists decides whether
     * the header shows one instead of the site title.
     */
    let hasLogo = false;
    try {
      const ctx = await loadBusinessContext(site.id);
      if (ctx?.logoUrl) {
        await setSiteLogo({ installPath: installation.installPath, dataUrl: ctx.logoUrl });
        hasLogo = true;
      }
    } catch (err) {
      // Non-fatal: a site with its name in the header instead of a logo works.
      console.warn("[wp] could not set the site logo", err);
    }

    /*
     * Brand colours AND the client's design values into theme.json.
     *
     * After syncTheme for the same reason as the template parts: it replaces
     * the theme directory wholesale. One write restyles every section, because
     * sections.css reads these presets rather than hardcoding hexes.
     */
    try {
      await writeThemePalette({
        installPath: installation.installPath,
        colors: resolveBrandColors(site.brandPaletteKey, site.brandColors),
        /*
         * The RESOLVED values, platform defaults under the site's own.
         * WordPress has no notion of our platform layer and needs none — it
         * receives the answer, not the arithmetic. Sanitised inside
         * resolveTokens, so a value stored when a range was wider cannot
         * reach a published stylesheet now that it is narrower.
         */
        tokens: resolveTokens((await getPlatformSettings()).designTokens, site.designTokens),
      });
    } catch (err) {
      // Non-fatal: the theme's own defaults are a working palette.
      console.warn("[wp] could not write theme.json palette", err);
    }

    /*
     * Write the site's header and footer into the theme.
     *
     * AFTER syncTheme and after provisioning, both of which copy the theme
     * directory wholesale and would overwrite these. Before this existed, the
     * exported site always showed the stub that ships in source — the site
     * title and "All rights reserved" — so none of the header or footer
     * sections in the library could ever appear on a real site.
     *
     * Non-fatal: a site with the stub chrome is a working site, and failing the
     * whole export over a template part would lose the page content too.
     */
    for (const [name, node] of [
      ["header", site.headerSchemaJson],
      ["footer", site.footerSchemaJson],
    ] as const) {
      const chrome = node as { type?: string; props?: unknown } | null;
      if (!chrome?.type) continue;
      try {
        const html = withSiteLogo(
          sectionToTemplatePart(chrome.type, chrome.props ?? {}),
          hasLogo,
        );
        if (html.trim()) {
          await writeTemplatePart({ installPath: installation.installPath, name, html });
        }
      } catch (err) {
        console.warn(`[wp] could not write parts/${name}.html`, err);
      }
    }

    const formEndpoint = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/forms/submit`;

    // Every page is reconciled by slug — created if absent, updated if not.
    let frontPageUrl = "";
    for (const page of exportable) {
      const isHome = page.slug === "home";
      const schema = await sideloadSchemaImages(
        page.schemaJson,
        installation.installPath,
        installation.url,
      );
      /*
       * Fill every form mount with a working, script-free form.
       *
       * An embed makes the client's site depend on VibeWP being reachable; if
       * the script cannot load their contact page silently has no form, and a
       * lost enquiry is invisible in a way a missing image is not. embed.js
       * clears the mount before rendering, so the enhanced form replaces this
       * one whenever the script does load.
       */
      const markup = await withStaticForms(schemaToGutenberg(schema), formEndpoint);
      const pushed = await upsertPage({
        installPath: installation.installPath,
        slug: page.slug,
        title: isHome ? site.name : (page.title ?? page.slug),
        blockMarkup: markup,
        asFrontPage: isHome,
        /*
         * The page's meta tags, as post meta the theme renders. Sent on every
         * export including when empty, so clearing a description in VibeWP
         * clears it on the live site rather than leaving the old one behind.
         */
        meta: {
          title: page.metaTitle,
          description: page.metaDescription,
          noIndex: page.noIndex,
          canonical: page.canonicalUrl,
        },
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

    return {
      ok: true,
      url: installation.url ?? "",
      provisioned,
      pageUrl: pushed.url,
      ...(pluginReport.failed.length ? { pluginFailures: pluginReport.failed } : {}),
    };
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

  /*
   * A Vibe site has no wp-admin to open, including one that used to.
   *
   * The builder hides this menu in Vibe mode, which is not the same thing as
   * the action refusing: a downgraded site still has an install on disk, and
   * minting a login link into it would hand someone the editor for a site we
   * no longer serve from.
   */
  if (site.mode !== "wordpress") {
    return { ok: false, error: "This is a Vibe site — there's no WordPress admin for it." };
  }

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
 * Publishes a Vibe site by claiming the address it will answer on.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE SUBDOMAIN IS CLAIMED HERE AND NOT AT CREATION
 *
 * A name handed out when a site row is created is a name held by every
 * abandoned draft. Publishing is the first moment anyone has committed to the
 * site actually existing, so it is the first moment worth spending a name on.
 *
 * Once claimed it is never reassigned by this function: the address has been
 * given out, possibly printed on something, and a site that silently moves
 * because its owner renamed the business is a site whose links all break.
 * ─────────────────────────────────────────────────────────────────────
 */
async function publishVibeSite(
  site: typeof sites.$inferSelect,
  userId: string,
): Promise<PublishResult> {
  if (!sitesHost()) {
    return {
      ok: false,
      error: "Platform hosting isn't configured yet, so there's nowhere for this to go live.",
    };
  }

  /* Something has to be served. A site whose pages are all empty would publish
     to a blank screen, which reads as a broken site rather than a new one. */
  const pages = await db.select().from(sitePages).where(eq(sitePages.siteId, site.id));
  const hasContent = pages.some((p) => schemaToGutenberg(p.schemaJson).trim().length > 0);
  if (!hasContent) {
    return { ok: false, error: "There's no content to publish yet — build a page first." };
  }

  /*
   * Take the photographs before going live.
   *
   * Generated content stores the Pexels CDN URL it was found at, so without
   * this every visitor to every published Vibe site would be fetching images
   * from a third party we do not control — the same dependency export removes
   * by sideloading into the media library. A photograph that cannot be
   * fetched keeps its original URL rather than failing the publish.
   *
   * Only at publish, which means an image added by chat afterwards stays on
   * Pexels until the next one. Doing it on every save would put a network
   * fetch in the path of every edit, and the fix is simply to publish again.
   * How many pages moved is recorded on the activity entry below.
   */
  let adopted = 0;
  for (const p of pages) {
    const { changed, schema } = await adoptSchemaImages(site.id, p.schemaJson);
    if (!changed) continue;
    await db.update(sitePages).set({ schemaJson: schema }).where(eq(sitePages.id, p.id));
    adopted += 1;
  }

  /* The logo becomes a file too — see adoptLogo. The stored data URL is left
     alone because the canvas and `wp media import` both need the bytes. */
  const profile = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerId, site.id), eq(businessProfiles.ownerType, "site")),
  });
  await adoptLogo(site.id, profile?.logoUrl);

  let subdomain = site.vibeSubdomain;
  if (!subdomain) {
    subdomain = await claimVibeSubdomain(site);
    if (!subdomain) {
      return { ok: false, error: "Couldn't find an available address for this site." };
    }
  }

  await db
    .update(sites)
    .set({ status: "live", vibeSubdomain: subdomain })
    .where(eq(sites.id, site.id));

  const url = vibeSiteUrl(subdomain) ?? "";
  await logActivity({
    actorUserId: userId,
    actorName: await actorNameFor(userId),
    action: "site.published",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: { url, mode: "vibe", pagesWithAdoptedImages: adopted },
  });

  return { ok: true, url };
}


/**
 * Publish — flips the site from draft to live.
 *
 * For a WordPress site this deliberately requires an export first: marking a
 * site live when no WordPress exists behind it would be a lie. A Vibe site has
 * the same rule in a different shape — it needs an address and something to
 * serve at it, which is what publishVibeSite establishes.
 */
export async function publishSiteAction(smbId: string): Promise<PublishResult> {
  const { user, site } = await requireSiteAccess(smbId);

  if (site.mode === "vibe") return publishVibeSite(site, user.id);

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
