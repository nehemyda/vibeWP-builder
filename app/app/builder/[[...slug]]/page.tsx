import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePages, agencies, profiles, builderMessages } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { extractHeroContent } from "@/lib/builder-content";
import { resolveSitePaths } from "@/lib/site-paths";
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

  const initialContent = extractHeroContent(page?.schemaJson);

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
    backPath = "/agency";
    backLabel = "Agency dashboard";
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
      }))}
      initialMessages={storedMessages.map((m) => ({
        id: m.id,
        role: m.role === "user" ? ("user" as const) : ("ai" as const),
        text: m.text,
        steps: m.steps ?? [],
      }))}
      builderPath={builderPath}
      backPath={backPath}
      backLabel={backLabel}
      siteName={site.name}
      initialContent={initialContent}
      prompt={prompt ?? null}
      autostart={autostart === "1"}
    />
  );
}
