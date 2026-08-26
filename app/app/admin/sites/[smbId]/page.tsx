import { notFound, redirect } from "next/navigation";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, agencies, profiles, leads, businessProfiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { SiteDetailContent } from "@/components/dashboard/SiteDetailContent";
import { parsePage, pageOffset, PAGE_SIZE } from "@/lib/pagination";
import { startImpersonationAction } from "@/app/actions/impersonation";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";

export default async function AdminSiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ smbId: string }>;
  searchParams: Promise<{ page?: string; saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { smbId } = await params;
  const { page: pageParam, saved } = await searchParams;
  const page = parsePage(pageParam);

  const site = await db.query.sites.findFirst({ where: eq(sites.smbId, smbId) });
  if (!site) notFound();

  if (site.agencyId) {
    const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) });
    if (agency?.partnerId) {
      redirect(`/admin/agencies/${agency.partnerId}/sites/${site.smbId}`);
    }
  }

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

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/agencies"
      userName={profile.fullName}
      userRole="Super admin"
      title={site.name}
      subtitle={
        <>
          SMB ID{" "}
          <CopyableText value={site.smbId ?? ""}>
            <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
          </CopyableText>
        </>
      }
      topActions={
        <form action={startImpersonationAction.bind(null, site.ownerUserId)}>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            View SMB dashboard ↗
          </button>
        </form>
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
        basePath={`/admin/sites/${site.smbId}`}
        listPath="/admin/agencies"
        builderPath={`/builder/${site.smbId}`}
        businessProfile={businessProfile ?? null}
        canEditBusinessProfile
      />
    </DashboardShell>
  );
}
