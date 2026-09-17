import Link from "next/link";
import { sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, sites, profiles, plans } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { AdminSearch } from "@/components/dashboard/AdminSearch";
import { parsePage, pageOffset, totalPages, PAGE_SIZE } from "@/lib/pagination";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";
import { planLabel } from "@/lib/billing";

function agencyStatusPill(status: string) {
  if (status === "active") return null;
  if (status === "suspended") return { cls: "pillWarn", label: "Suspended" };
  if (status === "archived") return { cls: "pillDraft", label: "Archived" };
  return { cls: "pillDanger", label: "Deleted" };
}

export default async function AdminAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; showDeleted?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { page: pageParam, showDeleted } = await searchParams;
  const page = parsePage(pageParam);
  const statusFilter = showDeleted ? sql`true` : sql`${agencies.status} != 'deleted'`;

  const [agencyList, [{ count: totalCount }]] = await Promise.all([
    db
      .select({
        id: agencies.id,
        partnerId: agencies.partnerId,
        name: agencies.name,
        plan: agencies.plan,
        status: agencies.status,
        createdAt: agencies.createdAt,
        ownerName: profiles.fullName,
      })
      .from(agencies)
      .leftJoin(profiles, sql`${profiles.id} = ${agencies.ownerUserId}`)
      .where(statusFilter)
      .orderBy(sql`${agencies.createdAt} desc`)
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db.select({ count: sql<number>`count(*)::int` }).from(agencies).where(statusFilter),
  ]);

  const siteCounts = await db
    .select({ agencyId: sites.agencyId, count: sql<number>`count(*)::int` })
    .from(sites)
    .where(isNull(sites.deletedAt))
    .groupBy(sites.agencyId);
  const siteCountMap = new Map(siteCounts.map((r) => [r.agencyId, r.count]));

  /* Agencies store the plan KEY; the catalogue carries the name an admin
     actually edits at /admin/billing. */
  const planCatalogue = await db.select({ key: plans.key, name: plans.name }).from(plans);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/agencies"
      userName={profile.fullName}
      userRole="Super admin"
      title="Agencies"
      subtitle={`${totalCount} agencies on the platform`}
      topActions={
        <>
          <AdminSearch />
          <Link className={shell.btn} href={showDeleted ? "/admin/agencies" : "/admin/agencies?showDeleted=1"}>
            {showDeleted ? "Hide deleted" : "Show deleted"}
          </Link>
          <Link className={`${shell.btn} ${shell.btnPrimary}`} href="/admin/agencies/new">
            + New agency
          </Link>
        </>
      }
    >
      <div className={shell.panel}>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Partner ID</th>
                <th>Agency</th>
                <th>Owner</th>
                <th>Plan</th>
                <th>Sites</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {agencyList.map((a) => {
                const statusPill = agencyStatusPill(a.status);
                return (
                  <tr key={a.id}>
                    <td>
                      <CopyableText value={a.partnerId ?? ""}>
                        <span className={shell.idBadge}>{a.partnerId ?? "—"}</span>
                      </CopyableText>
                    </td>
                    <td>
                      <CopyableText value={a.name}>
                        <div className={shell.rowName}>
                          {a.name}
                          {statusPill && (
                            <span className={`${shell.pill} ${shell[statusPill.cls]}`} style={{ marginLeft: "0.5rem" }}>
                              {statusPill.label}
                            </span>
                          )}
                        </div>
                      </CopyableText>
                      <div className={shell.rowSub}>joined {a.createdAt.toLocaleDateString()}</div>
                    </td>
                    <td>
                      {a.ownerName ? (
                        <CopyableText value={a.ownerName}>{a.ownerName}</CopyableText>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{planLabel(a.plan, planCatalogue)}</td>
                    <td>{siteCountMap.get(a.id) ?? 0}</td>
                    <td>
                      <Link className={`${shell.btn} ${shell.btnSmall}`} href={`/admin/agencies/${a.partnerId}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {agencyList.length === 0 && (
                <tr>
                  <td colSpan={6} className={shell.rowSub}>
                    No agencies yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages(totalCount)}
          basePath={showDeleted ? "/admin/agencies?showDeleted=1" : "/admin/agencies"}
        />
      </div>
    </DashboardShell>
  );
}
