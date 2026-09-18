import { notFound, redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
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
import { planLabel } from "@/lib/billing";
import type { ChromeNode } from "@/app/actions/ai-generate";
import type { FormPreviewField } from "@/lib/wp/serialize";
import { loadIntakeState } from "@/lib/intake-state";
import { getPlatformSettings } from "@/lib/platform-settings";
import { vibeSiteUrl } from "@/lib/render/hosting";
import { resolveTokens } from "@/lib/design/resolve";
import { pageTitle } from "@/lib/render/page-document";
import { formDefinitions } from "@/lib/db/schema";
import { sectionsForPlan } from "@/lib/sections/resolve";
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
  searchParams: Promise<{ prompt?: string; autostart?: string; panel?: string }>;
}) {
  const { slug } = await params;
  const { prompt, autostart, panel } = await searchParams;

  if (!slug || slug.length < 1 || slug.length > 2) notFound();

  const smbId = slug.length === 1 ? slug[0] : slug[1];
  const urlPartnerId = slug.length === 2 ? slug[0] : null;

  const { user, site } = await requireSiteAccess(smbId);

  const query = prompt ? `?prompt=${encodeURIComponent(prompt)}&autostart=${autostart ?? ""}` : "";

  /*
   * ONE ROUND OF WAITING, NOT NINE.
   *
   * These nine were nine separate `await`s down the body of this function.
   * Every one is a round trip to a database in ap-south-1 at roughly 60ms,
   * none of them needs anything from the one before, and the page rendered
   * nothing until the last returned: 558ms of the builder's load was this
   * function queuing behind itself. Together they take 121ms — the cost of
   * the slowest, which is all it was ever meant to be.
   *
   * The measurement is worth keeping because the shape is inviting: each of
   * those awaits was correct on the line it was written, and the next feature
   * that needs one more thing from the database will want to add a tenth
   * await under the ninth. It goes in here instead.
   *
   * What may NOT go in here is anything that reads a value produced above:
   * `revisionKinds` needs the page this resolves, so it stays below.
   */
  const [
    { builderPath, dashboardPath },
    installation,
    [allPages, storedMessages],
    initialIntake,
    platform,
    siteForms,
    callerProfile,
    planSections,
  ] = await Promise.all([
    resolveSitePaths(site),
    // Whether a WordPress install already exists decides if "View site" and
    // "WP Admin" are shown on load. Without this they only appeared after an
    // export in the same session, so returning to an exported site showed
    // nothing.
    db.query.siteInstallations.findFirst({ where: eq(siteInstallations.siteId, site.id) }),
    Promise.all([
      db.select().from(sitePages).where(eq(sitePages.siteId, site.id)).orderBy(sitePages.createdAt),
      db
        .select()
        .from(builderMessages)
        .where(eq(builderMessages.siteId, site.id))
        .orderBy(builderMessages.createdAt),
    ]),
    /*
     * Prefilled from whatever Settings already holds, so a client who filled
     * in their business details once is never asked for them again.
     *
     * The loader, not the action. The action re-authenticates — a getUser()
     * over the network plus canEditSite's four queries — and requireSiteAccess
     * above has just proven the same thing about the same user and the same
     * site. This page had been paying for that answer twice, and the second
     * time cost more than the data did.
     */
    loadIntakeState(site.id),
    // Hosting targets for the site-details drawer. Null until an admin sets them.
    getPlatformSettings(),
    /*
     * EVERY form on the site, keyed by its embed token.
     *
     * This took the first active form and handed it to the canvas whatever
     * page was open, so the quote page drew the contact form's questions and a
     * field added to the quote form never appeared. Which form a page shows is
     * decided by the token in its own FormEmbed node, and the canvas switches
     * pages without asking the server, so it needs them all.
     */
    db
      .select()
      .from(formDefinitions)
      .where(and(eq(formDefinitions.siteId, site.id), eq(formDefinitions.isActive, true))),
    // "Back" goes somewhere useful for whoever is actually looking at the
    // builder right now.
    db.query.profiles.findFirst({ where: eq(profiles.id, user.id) }),
    sectionsForPlan(site.plan ?? "starter"),
  ]);

  /*
   * Agency-managed sites must be reached through the nested URL; directly-owned
   * sites must be reached through the flat one. Redirect-correct otherwise.
   *
   * After the fetch rather than before it now. A mismatched URL therefore does
   * one round of queries it will not use — 121ms, on the rare visit that
   * arrives at the wrong shape — and in exchange every correct visit, which is
   * all of them in practice, stops waiting on this lookup alone before it can
   * start the other eight.
   */
  const requestedPath = urlPartnerId ? `/builder/${urlPartnerId}/${smbId}` : `/builder/${smbId}`;
  if (requestedPath !== builderPath) {
    redirect(`${builderPath}${query}`);
  }

  // The home page is what the canvas shows on load; the switcher moves off it.
  const page = allPages.find((p) => p.slug === "home") ?? allPages[0];

  const formsByToken = Object.fromEntries(
    siteForms
      .filter((f) => f.embedToken)
      .map((f) => [
        f.embedToken as string,
        {
          fields: (f.fields as FormPreviewField[]) ?? [],
          style: (f.style as Record<string, string>) ?? {},
        },
      ]),
  );

  /*
   * Real contact details, so the canvas resolves the {{phone}}-style tokens
   * the generated content carries and shows what the live site will show.
   *
   * Taken from the intake prefill rather than fetched again. This page loaded
   * the business context a second time and derived the same facts from it —
   * `contactFactsFor` of a context with no profile row returns {}, which is
   * exactly what the old fallback produced — so it was a query and a second
   * derivation of one value, either of which could drift from the other.
   */
  const previewFacts = initialIntake.facts;

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

  /*
   * The site's own SMB dashboard if that is genuinely who is looking,
   * otherwise wherever an agency or admin caller would expect to land.
   */
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

  /*
   * The designs this site may use, for the canvas's Change design panel.
   *
   * Only the serialisable half: `definition` holds functions, so it cannot
   * cross to the client — and does not need to, because the whole registry is
   * already in the client bundle. What the client cannot know is POLICY: which
   * sections an admin has switched off, renamed or restricted by plan. That is
   * what travels.
   */
  const catalogue = planSections.map((s) => ({
    key: s.key,
    nodeType: s.nodeType,
    name: s.name,
    description: s.description,
    category: s.category,
  }));

  return (
    <BuilderApp
      catalogue={catalogue}
      /*
       * Which dashboard tab to open, read HERE rather than from
       * window.location in the client.
       *
       * Reading it client-side meant the server rendered the top bar with no
       * tab active and the client rendered it with one, so hydration failed on
       * the Images button's class — the "server/client branch" case the error
       * names first. The page already has searchParams; passing it down means
       * both renders start from the same value and there is no branch to
       * disagree about.
       */
      initialPanel={panel}
      // Sanitised on the way out as well as in: a value that was valid when it
      // was stored can fall outside a range we later narrow, and the canvas
      // should show what the exported site will show.
      initialDesignTokens={resolveTokens(platform.designTokens, site.designTokens)}
      siteId={site.id}
      smbId={site.smbId ?? ""}
      initialPages={allPages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: pageTitle(p.slug, p.title),
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
      mode={site.mode}
      vibeUrl={site.status === "live" ? vibeSiteUrl(site.vibeSubdomain) : null}
      initialSchema={initialSchema}
      initialIntake={initialIntake}
      previewFacts={previewFacts}
      formsByToken={formsByToken}
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
        plan: site.plan ? planLabel(site.plan) : null,
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
