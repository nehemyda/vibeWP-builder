import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sitePages,
  agencies,
  profiles,
  builderMessages,
  siteInstallations,
  pageRevisions,
} from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { resolveSitePaths } from "@/lib/site-paths";
import type { ChromeNode } from "@/app/actions/ai-generate";
import { loadIntakeAction } from "@/app/actions/intake";
import { getPlatformSettings } from "@/lib/platform-settings";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";
import { BuilderApp } from "./BuilderApp";

/**
 * Single route for both URL shapes, since Next.js won't allow two different
 * dynamic segment names ("smbId" vs "partnerId") at the same path position:
 *   /builder/[smbId]              — directly-owned (no agency) sites
 *   /builder/[partnerId]/[smbId]  — agency-managed sites, Partner ID included
 */
export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ prompt?: string; autostart?: string }>;
}) {
  const { slug } = await params;
  const { prompt, autostart } = await searchParams;

  if (!slug || slug.length < 1 || slug.length > 2) notFound();

  const smbId = slug.length === 1 ? slug[0] : slug[1];
  const urlPartnerId = slug.length === 2 ? slug[0] : null;

  const { user, site } = await requireSiteAccess(smbId);

  const query = prompt ? `?prompt=${encodeURIComponent(prompt)}&autostart=${autostart ?? ""}` : "";
  const { builderPath, dashboardPath } = await resolveSitePaths(site);

  // Agency-managed sites must be reached through the nested URL; directly-owned
  // sites must be reached through the flat one. Redirect-correct otherwise.
  const requestedPath = urlPartnerId ? `/builder/${urlPartnerId}/${smbId}` : `/builder/${smbId}`;
  if (requestedPath !== builderPath) {
    redirect(`${builderPath}${query}`);
  }

  // Whether a WordPress install already exists decides if "View site" and
  // "WP Admin" are shown on load. Without this they only appeared after an
  // export in the same session, so returning to an exported site showed
  // nothing.
  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, site.id),
  });

  const [allPages, storedMessages] = await Promise.all([
    db.select().from(sitePages).where(eq(sitePages.siteId, site.id)).orderBy(sitePages.createdAt),
    db
      .select()
      .from(builderMessages)
      .where(eq(builderMessages.siteId, site.id))
      .orderBy(builderMessages.createdAt),
  ]);

  // The home page is what the canvas shows on load; the switcher moves off it.
  const page = allPages.find((p) => p.slug === "home") ?? allPages[0];

  // Prefilled from whatever Settings already holds, so a client who filled in
  // their business details once is never asked for them again.
  const initialIntake = await loadIntakeAction(site.id);

  // Hosting targets for the site-details drawer. Null until an admin sets them.
  const platform = await getPlatformSettings();

  // Real contact details, so the canvas resolves the {{phone}}-style tokens
  // the generated content carries and shows what the live site will show.
  const businessCtx = await loadBusinessContext(site.id);
  const previewFacts = businessCtx ? contactFactsFor(businessCtx) : {};

  // The whole schema, so the canvas paints every section on first load and
  // not just the hero the extractor pulls out.
  const initialSchema = (page?.schemaJson as Record<string, unknown> | undefined) ?? null;

  // Undo/redo depth for the page shown on load, so the toolbar buttons are
  // correct on first paint rather than flicking from disabled to enabled.
  const revisionKinds = page
    ? await db
        .select({ kind: pageRevisions.kind })
        .from(pageRevisions)
        .where(eq(pageRevisions.pageId, page.id))
    : [];
  const initialHistory = {
    canUndo: revisionKinds.some((r) => r.kind === "undo"),
    canRedo: revisionKinds.some((r) => r.kind === "redo"),
  };

  // "Back" goes somewhere useful for whoever is actually looking at the
  // builder right now — the site's own SMB dashboard if that's genuinely
  // them, otherwise wherever an agency/admin caller would expect to land.
  const callerProfile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  let backPath = "/";
  let backLabel = "Back";
  if (user.id === site.ownerUserId && callerProfile?.role === "smb_owner") {
    backPath = dashboardPath;
    backLabel = "Dashboard";
  } else if (callerProfile?.role === "agency_owner" || callerProfile?.role === "agency_member") {
    /*
     * THIS site's dashboard, not the agency's list of all of them.
     *
     * Leaving the builder used to land on /agency — the top of the tree, with
     * no memory of which client you had open. Someone who came in to edit one
     * site and stepped out for a moment then had to find it again. dashboardPath
     * is /dashboard/{PartnerID}/{SMB-ID}, so "back" returns to the project
     * being worked on.
     */
    backPath = dashboardPath;
    // Just "Dashboard": whose dashboard it is follows from where you land, and
    // the toolbar has better uses for the width.
    backLabel = "Dashboard";
  } else if (callerProfile?.role === "super_admin") {
    if (site.agencyId) {
      const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) });
      backPath = agency?.partnerId ? `/admin/agencies/${agency.partnerId}/sites/${site.smbId}` : "/admin/agencies";
    } else {
      backPath = `/admin/sites/${site.smbId}`;
    }
    backLabel = "Site detail";
  }

  return (
    <BuilderApp
      siteId={site.id}
      smbId={site.smbId ?? ""}
      initialPages={allPages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title:
          p.title ??
          p.slug
            .split("-")
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        schema: (p.schemaJson as Record<string, unknown> | null) ?? null,
      }))}
      initialMessages={storedMessages.map((m) => ({
        id: m.id,
        role: m.role === "user" ? ("user" as const) : ("ai" as const),
        text: m.text,
        steps: m.steps ?? [],
      }))}
      initialWpUrl={installation?.status === "ready" ? (installation.url ?? null) : null}
      initialHistory={initialHistory}
      builderPath={builderPath}
      backPath={backPath}
      backLabel={backLabel}
      siteName={site.name}
      initialSchema={initialSchema}
      initialIntake={initialIntake}
      previewFacts={previewFacts}
      /*
       * Read here rather than in the drawer: it is a server component, so the
       * hosting records never travel through a client action, and an unset
       * value arrives as null instead of an example somebody might type into a
       * registrar.
       */
      siteDetails={{
        siteName: site.name,
        smbId: site.smbId ?? "",
        partnerId: urlPartnerId,
        plan: site.plan ?? null,
        status: site.status ?? null,
        wpUrl: installation?.status === "ready" ? (installation.url ?? null) : null,
        domain: site.domain ?? null,
        createdAt: site.createdAt ? new Date(site.createdAt).toLocaleDateString() : null,
        lastEditedAt: site.lastEditedAt ? new Date(site.lastEditedAt).toLocaleString() : null,
        pageCount: allPages.length,
        hostingIpv4: platform?.hostingIpv4 ?? null,
        hostingCname: platform?.hostingCname ?? null,
      }}
      initialChrome={{
        header: (site.headerSchemaJson as ChromeNode | null) ?? null,
        footer: (site.footerSchemaJson as ChromeNode | null) ?? null,
      }}
      prompt={prompt ?? null}
      autostart={autostart === "1"}
    />
  );
}
