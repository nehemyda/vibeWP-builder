import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";

/**
 * Resolves the canonical dashboard/builder URLs for a site — nested under
 * the agency's Partner ID when the site is agency-managed, flat otherwise.
 * Centralized so every page that links into a site's own dashboard or
 * builder builds the same URL, without a redirect bounce.
 */
export async function resolveSitePaths(site: { smbId: string | null; agencyId: string | null }) {
  if (!site.smbId) {
    return {
      dashboardPath: "/dashboard",
      builderPath: "/dashboard",
      leadsPath: "/dashboard",
      teamPath: "/dashboard",
      billingPath: "/dashboard",
      settingsPath: "/dashboard",
    };
  }

  let partnerId: string | null = null;
  if (site.agencyId) {
    const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) });
    partnerId = agency?.partnerId ?? null;
  }

  const base = partnerId ? `/dashboard/${partnerId}/${site.smbId}` : `/dashboard/${site.smbId}`;

  return {
    dashboardPath: base,
    builderPath: partnerId ? `/builder/${partnerId}/${site.smbId}` : `/builder/${site.smbId}`,
    leadsPath: `${base}/leads`,
    teamPath: `${base}/team`,
    billingPath: `${base}/billing`,
    settingsPath: `${base}/settings`,
  };
}
