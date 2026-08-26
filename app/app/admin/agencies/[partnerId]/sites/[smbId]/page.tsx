import { notFound } from "next/navigation";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, sites, profiles, leads, businessProfiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { SiteDetailContent } from "@/components/dashboard/SiteDetailContent";
import { parsePage, pageOffset, PAGE_SIZE } from "@/lib/pagination";
import { startImpersonationAction } from "@/app/actions/impersonation";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../../../nav";

export default async function AdminAgencySiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string; smbId: string }>;
  searchParams: Promise<{ page?: string; saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { partnerId, smbId } = await params;
  const { page: pageParam, saved } = await searchParams;
  const page = parsePage(pageParam);

  const agency = await db.query.agencies.findFirst({ where: eq(agencies.partnerId, partnerId) });
  if (!agency) notFound();

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

  const basePath = `/admin/agencies/${agency.partnerId}/sites/${site.smbId}`;

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
          </CopyableText>{" "}
          · Partner{" "}
          <a href={`/admin/agencies/${agency.partnerId}`} className={shell.idBadge} style={{ textDecoration: "none" }}>
            {agency.partnerId}
          </a>
        </>
      }
      topActions={
        <form action={startImpersonationAction.bind(null, site.ownerUserId)}>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            {owner?.role === "smb_owner" ? "View SMB dashboard ↗" : "View agency dashboard ↗"}
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
        basePath={basePath}
        listPath={`/admin/agencies/${agency.partnerId}`}
        builderPath={`/builder/${agency.partnerId}/${site.smbId}`}
        businessProfile={businessProfile ?? null}
        canEditBusinessProfile
      />
    </DashboardShell>
  );
}
