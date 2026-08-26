import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { startImpersonationAction } from "@/app/actions/impersonation";
import { deleteSiteAction } from "@/app/actions/sites";
import { parsePage, pageOffset, totalPages, PAGE_SIZE } from "@/lib/pagination";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import styles from "../../agency.module.css";
import { agencyNav } from "../../nav";

function pillFor(status: string) {
  if (status === "live") return { cls: "pillLive", label: "Live" };
  if (status === "trial") return { cls: "pillTrial", label: "Trial" };
  return { cls: "pillDraft", label: "Draft" };
}

export default async function AgencySitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { partnerId } = await params;
  const { user, profile, agency } = await requireAgency();
  const page = parsePage((await searchParams).page);

  if (!agency) {
    return (
      <DashboardShell
        navGroups={agencyNav("Your agency", null)}
        activeHref="/agency"
        userName={profile.fullName}
        userRole="Agency owner"
        title="Client sites"
        subtitle="This account isn't linked to an agency yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Ask a super admin to link your account to an agency first.
        </div>
      </DashboardShell>
    );
  }

  const basePath = `/agency/${agency.partnerId}`;

  // The Partner ID in the URL is just for a legible, shareable link — access
  // is always derived from the session above, never from this param.
  if (agency.partnerId !== partnerId) {
    redirect(`${basePath}/sites`);
  }

  const [siteList, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(sites)
      .where(and(eq(sites.agencyId, agency.id), isNull(sites.deletedAt)))
      .orderBy(desc(sites.lastEditedAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(and(eq(sites.agencyId, agency.id), isNull(sites.deletedAt))),
  ]);

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={`${basePath}/sites`}
      userName={profile.fullName}
      userRole="Agency owner"
      title="All client sites"
      subtitle={`${totalCount} sites on ${agency.name}`}
      topActions={
        <Link className={`${shell.btn} ${shell.btnPrimary}`} href={`${basePath}/sites/new`}>
          + New client
        </Link>
      }
    >
      <div className={shell.panel}>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>SMB ID</th>
                <th>Site</th>
                <th>Status</th>
                <th>Last edited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {siteList.map((site) => {
                const pill = pillFor(site.status);
                return (
                  <tr key={site.id}>
                    <td>
                      <CopyableText value={site.smbId ?? ""}>
                        <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
                      </CopyableText>
                    </td>
                    <td>
                      <div className={styles.nameCell}>
                        <div className={styles.siteThumb} />
                        <div>
                          <CopyableText value={site.name}>
                            <div className={shell.rowName}>{site.name}</div>
                          </CopyableText>
                          <div className={shell.rowSub}>{site.domain ?? "not yet published"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`${shell.pill} ${shell[pill.cls]}`}>{pill.label}</span>
                    </td>
                    <td>{site.lastEditedAt.toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                        <Link
                        className={`${shell.btn} ${shell.btnSmall}`}
                        href={`${basePath}/sites/${site.smbId}`}
                      >
                          View
                        </Link>
                        <a
                          className={`${shell.btn} ${shell.btnSmall}`}
                          href={`/builder/${agency.partnerId}/${site.smbId}`}
                        >
                          Open in builder
                        </a>
                        {site.ownerUserId !== user.id && (
                          <form action={startImpersonationAction.bind(null, site.ownerUserId)}>
                            <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                              Dashboard
                            </button>
                          </form>
                        )}
                        <form action={deleteSiteAction.bind(null, site.id, `${basePath}/sites`)}>
                          <ConfirmSubmitButton
                            confirmMessage={`Delete ${site.name}? This hides it but keeps all leads and builder content — recoverable by a super admin.`}
                            className={`${shell.btn} ${shell.btnSmall}`}
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {siteList.length === 0 && (
                <tr>
                  <td colSpan={5} className={shell.rowSub}>
                    No client sites yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages(totalCount)} basePath={`${basePath}/sites`} />
      </div>
    </DashboardShell>
  );
}
