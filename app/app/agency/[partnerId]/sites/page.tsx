import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, desc, sql, and, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { startImpersonationAction } from "@/app/actions/impersonation";
import { deleteSiteAction } from "@/app/actions/sites";
import { restoreSiteFormAction, purgeSiteFormAction } from "@/app/actions/site-lifecycle";
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
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const { partnerId } = await params;
  const { user, profile, agency } = await requireAgency();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  /*
   * Deleted sites live behind a tab, not mixed into the list.
   *
   * They are recoverable, not gone, so hiding them entirely would make a soft
   * delete feel like a real one — and every irreversible action belongs on a
   * screen someone chose to open, not next to the everyday ones.
   */
  const showDeleted = sp.tab === "deleted";
  const scope = showDeleted ? isNotNull(sites.deletedAt) : isNull(sites.deletedAt);

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
      .where(and(eq(sites.agencyId, agency.id), scope))
      .orderBy(desc(sites.lastEditedAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(and(eq(sites.agencyId, agency.id), scope)),
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
      <nav style={{ display: "flex", gap: "1.3rem", borderBottom: "1px solid var(--line, #e6e8ee)", marginBottom: "1.1rem" }}>
        {([["Active", ""], ["Deleted", "?tab=deleted"]] as const).map(([label, q]) => {
          const on = (q === "?tab=deleted") === showDeleted;
          return (
            <Link
              key={label}
              href={`${basePath}/sites${q}`}
              style={{
                padding: "0.55rem 0.1rem",
                fontSize: "0.9rem",
                fontWeight: on ? 700 : 500,
                color: on ? "var(--ink, #12151c)" : "var(--muted, #79808f)",
                borderBottom: `2px solid ${on ? "var(--ink, #12151c)" : "transparent"}`,
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

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
                            <div className={shell.rowName}>
                            {site.name}
                            {/*
                              Which sites are the agency's own.
                              The distinction existed only in behaviour — the
                              Dashboard button linked rather than impersonated —
                              which is invisible until you click. A site you own
                              and a client's site are managed identically and
                              billed identically; the only difference is whose
                              dashboard it is, so that is what the label says.
                            */}
                            {site.ownerUserId === user.id && (
                              <span
                                style={{
                                  marginLeft: "0.5rem",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: 999,
                                  border: "1px solid var(--line, #dbdee3)",
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                  color: "var(--muted, #79808f)",
                                  verticalAlign: "middle",
                                }}
                              >
                                Your site
                              </span>
                            )}
                          </div>
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
                        {/*
                          Every site has a dashboard. A client's needs
                          impersonation; one you own is a plain link, now that
                          agency roles may open a managed site's dashboard
                          scoped to their own agency.
                        */}
                        {site.ownerUserId === user.id ? (
                          <a
                            className={`${shell.btn} ${shell.btnSmall}`}
                            href={`/dashboard/${partnerId}/${site.smbId}`}
                          >
                            Dashboard
                          </a>
                        ) : (
                          <form action={startImpersonationAction.bind(null, site.ownerUserId)}>
                            <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                              Dashboard
                            </button>
                          </form>
                        )}
                        {showDeleted ? (
                          <>
                            <form action={restoreSiteFormAction.bind(null, site.smbId ?? "")}>
                              <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                                Restore
                              </button>
                            </form>
                            <form action={purgeSiteFormAction.bind(null, site.smbId ?? "")}>
                              <ConfirmSubmitButton
                                /* Names what goes, and that nothing brings it
                                   back. "Are you sure?" leaves someone guessing
                                   whether their enquiries survive — they do
                                   not, and that is the whole decision. */
                                confirmMessage={`Permanently delete ${site.name}? Its pages, form submissions, builder history and settings are destroyed. This cannot be undone.`}
                                className={`${shell.btn} ${shell.btnSmall}`}
                              >
                                Delete permanently
                              </ConfirmSubmitButton>
                            </form>
                          </>
                        ) : (
                          <form action={deleteSiteAction.bind(null, site.id, `${basePath}/sites`)}>
                            <ConfirmSubmitButton
                              confirmMessage={`Delete ${site.name}? This hides it but keeps all leads and builder content — you can restore it from the Deleted tab.`}
                              className={`${shell.btn} ${shell.btnSmall}`}
                            >
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        )}
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
