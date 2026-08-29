import { notFound, redirect } from "next/navigation";
import { requireSmbSite } from "@/lib/auth/require-site";
import { resolveSitePaths } from "@/lib/site-paths";
import { parsePage } from "@/lib/pagination";
import { OverviewView } from "../_views/OverviewView";
import { LeadsView } from "../_views/LeadsView";
import { TeamView } from "../_views/TeamView";
import { BillingView } from "../_views/BillingView";
import { SettingsView } from "../_views/SettingsView";

const SUB_PAGES = ["leads", "team", "billing", "settings"] as const;
type SubPage = (typeof SUB_PAGES)[number];

function isSubPage(value: string): value is SubPage {
  return (SUB_PAGES as readonly string[]).includes(value);
}

/**
 * Single route for every SMB dashboard URL shape, since Next.js won't allow
 * two different dynamic segment names ("smbId" vs "partnerId") at the same
 * path position:
 *   /dashboard/[smbId][/sub]              — directly-owned (no agency) sites
 *   /dashboard/[partnerId]/[smbId][/sub]  — agency-managed sites, Partner ID included
 * where [/sub] is an optional trailing "leads" | "team" | "settings".
 */
export default async function SmbDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ page?: string; tab?: string; form?: string; saved?: string; error?: string }>;
}) {
  const { slug } = await params;
  if (slug.length < 1 || slug.length > 3) notFound();

  const lastSegment = slug[slug.length - 1];
  const subPage = isSubPage(lastSegment) ? lastSegment : null;
  const siteSlug = subPage ? slug.slice(0, -1) : slug;
  if (siteSlug.length > 2) notFound();

  /* TEMPORARY TIMING — remove once the slow step is found. */
  const __t0 = Date.now();
  const { profile, role, site } = await requireSmbSite();
  console.log("[timing] requireSmbSite", Date.now() - __t0, "ms");
  const __t1 = Date.now();
  const sp = await searchParams;
  console.log("[timing] searchParams", Date.now() - __t1, "ms");

  if (!site) {
    if (subPage === "leads") return <LeadsView profile={profile} role={role} site={undefined} paths={null} page={1} />;
    if (subPage === "team") return <TeamView profile={profile} role={role} site={undefined} paths={null} error={sp.error} />;
    if (subPage === "billing") return <BillingView profile={profile} role={role} site={undefined} paths={null} />;
    if (subPage === "settings") return <SettingsView profile={profile} role={role} site={undefined} paths={null} saved={sp.saved} />;
    return <OverviewView profile={profile} role={role} site={undefined} paths={null} />;
  }

  const paths = await resolveSitePaths(site);
  const canonicalPath =
    subPage === "leads"
      ? paths.leadsPath
      : subPage === "team"
        ? paths.teamPath
        : subPage === "billing"
          ? paths.billingPath
          : subPage === "settings"
            ? paths.settingsPath
            : paths.dashboardPath;

  // The IDs (and sub-page segment) in the URL are just for a legible,
  // shareable link — access is always derived from the session above, never
  // from these params. Redirect-correct any stale or hand-typed URL,
  // including old flat sub-page links with no site ID at all.
  const siteSegment = siteSlug.length === 2 ? `/${siteSlug[0]}/${siteSlug[1]}` : siteSlug.length === 1 ? `/${siteSlug[0]}` : "";
  const requestedPath = `/dashboard${siteSegment}${subPage ? `/${subPage}` : ""}`;
  if (requestedPath !== canonicalPath) {
    redirect(canonicalPath);
  }

  if (subPage === "leads") {
    return (
      <LeadsView
        profile={profile}
        role={role}
        site={site}
        paths={paths}
        page={parsePage(sp.page)}
        tab={typeof sp.tab === "string" ? sp.tab : undefined}
        formId={typeof sp.form === "string" ? sp.form : undefined}
      />
    );
  }
  if (subPage === "team") {
    return <TeamView profile={profile} role={role} site={site} paths={paths} error={sp.error} />;
  }
  if (subPage === "billing") {
    return <BillingView profile={profile} role={role} site={site} paths={paths} />;
  }
  if (subPage === "settings") {
    return <SettingsView profile={profile} role={role} site={site} paths={paths} saved={sp.saved} />;
  }
  return <OverviewView profile={profile} role={role} site={site} paths={paths} />;
}
