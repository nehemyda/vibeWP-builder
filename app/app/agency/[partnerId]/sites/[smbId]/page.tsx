import { notFound, redirect } from "next/navigation";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, profiles, leads, businessProfiles } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { SiteDetailContent } from "@/components/dashboard/SiteDetailContent";
import { parsePage, pageOffset, PAGE_SIZE } from "@/lib/pagination";
import { startImpersonationAction } from "@/app/actions/impersonation";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { agencyNav } from "../../../nav";

export default async function AgencySiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string; smbId: string }>;
  searchParams: Promise<{ page?: string; saved?: string }>;
}) {
  const { user, profile, agency } = await requireAgency();
  const { partnerId, smbId } = await params;
  const { page: pageParam, saved } = await searchParams;
  const page = parsePage(pageParam);

  if (!agency) redirect("/agency");

  const rootPath = `/agency/${agency.partnerId}`;

  // The Partner ID in the URL is just for a legible, shareable link — access
  // is always derived from the session above, never from this param.
  if (agency.partnerId !== partnerId) {
    redirect(`${rootPath}/sites/${smbId}`);
  }

  const site = await db.query.sites.findFirst({ where: eq(sites.smbId, smbId) });
  if (!site || site.agencyId !== agency.id) notFound();

  const owner = await db.query.profiles.findFirst({ where: eq(profiles.id, site.ownerUserId) });
  const businessProfile = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerType, "site"), eq(businessProfiles.ownerId, site.id)),
  });

  const [leadsPage, [{ count: leadsTotalCount }]] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(eq(leads.siteId, site.id))
      .orderBy(desc(leads.receivedAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.siteId, site.id)),
  ]);

  const basePath = `${rootPath}/sites/${site.smbId}`;

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={`${rootPath}/sites`}
      userName={profile.fullName}
      userRole="Agency owner"
      title={site.name}
      subtitle={
        <>
          SMB ID{" "}
          <CopyableText value={site.smbId ?? ""}>
            <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
          </CopyableText>{" "}
          · Partner{" "}
          <CopyableText value={agency.partnerId ?? ""}>
            <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
          </CopyableText>
        </>
      }
      topActions={
        site.ownerUserId !== user.id ? (
          <form action={startImpersonationAction.bind(null, site.ownerUserId)}>
            <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
              {owner?.role === "smb_owner" ? "View SMB dashboard ↗" : "View agency dashboard ↗"}
            </button>
          </form>
        ) : undefined
      }
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}
      <SiteDetailContent
        site={site}
        ownerName={owner?.fullName ?? null}
        leadsPage={leadsPage}
        leadsTotalCount={leadsTotalCount}
        page={page}
        basePath={basePath}
        listPath={`${rootPath}/sites`}
        builderPath={`/builder/${agency.partnerId}/${site.smbId}`}
        businessProfile={businessProfile ?? null}
        canEditBusinessProfile
      />
    </DashboardShell>
  );
}
