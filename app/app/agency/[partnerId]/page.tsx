import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql, and, gte, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencyMembers, sites, businessProfiles } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { startImpersonationAction } from "@/app/actions/impersonation";
import { daysAgo } from "@/lib/time";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import styles from "../agency.module.css";
import { agencyNav } from "../nav";

function pillFor(status: string) {
  if (status === "live") return { cls: "pillLive", label: "Live" };
  if (status === "trial") return { cls: "pillTrial", label: "Trial" };
  return { cls: "pillDraft", label: "Draft" };
}

export default async function AgencyDashboardPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  const { user, profile, agency } = await requireAgency();

  if (!agency) {
    return (
      <DashboardShell
        navGroups={agencyNav("Your agency", null)}
        activeHref="/agency"
        userName={profile.fullName}
        userRole="Agency owner"
        title="No agency found"
        subtitle="This account isn't linked to an agency yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Ask a super admin to link your account to an agency, or create one
          from the registration flow.
        </div>
      </DashboardShell>
    );
  }

  // The Partner ID in the URL is just for a legible, shareable link — access
  // is always derived from the session above, never from this param. If it's
  // stale or wrong, correct it rather than showing someone else's agency.
  if (agency.partnerId !== partnerId) {
    redirect(`/agency/${agency.partnerId}`);
  }

  const thirtyDaysAgo = daysAgo(30);

  const [siteList, [{ count: totalSites }], [{ count: publishedThisMonth }], teamCount] =
    await Promise.all([
      db.query.sites.findMany({
        where: and(eq(sites.agencyId, agency.id), isNull(sites.deletedAt)),
        orderBy: (s, { desc }) => [desc(s.lastEditedAt)],
        limit: 10,
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(and(eq(sites.agencyId, agency.id), isNull(sites.deletedAt))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(
          and(
            eq(sites.agencyId, agency.id),
            eq(sites.status, "live"),
            gte(sites.createdAt, thirtyDaysAgo),
            isNull(sites.deletedAt),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agencyMembers)
        .where(eq(agencyMembers.agencyId, agency.id)),
    ]);

  const seatCount = teamCount[0]?.count ?? 0;
  const basePath = `/agency/${agency.partnerId}`;

  /*
   * Thumbnails from the logo we already hold.
   *
   * The cell was an empty <div> — a styled grey box never wired to anything, so
   * "the preview is not showing" was really "there is no preview". A real
   * screenshot needs a headless browser per site and somewhere to keep the
   * images; the logo is already stored and is what makes a row recognisable at
   * a glance. Fetched only for the rows on screen.
   */
  const logos = new Map<string, string>();
  if (siteList.length > 0) {
    /* Business profiles are polymorphic — an agency has one too — so the owner
       TYPE has to be part of the filter, not just the id. */
    const logoRows = await db
      .select({ ownerId: businessProfiles.ownerId, logoUrl: businessProfiles.logoUrl })
      .from(businessProfiles)
      .where(
        and(
          eq(businessProfiles.ownerType, "site"),
          inArray(businessProfiles.ownerId, siteList.map((row) => row.id)),
        ),
      );
    for (const r of logoRows) if (r.logoUrl) logos.set(r.ownerId, r.logoUrl);
  }

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={basePath}
      userName={profile.fullName}
      userRole="Agency owner"
      title="Client sites"
      subtitle={
        <>
          Partner ID{" "}
          <CopyableText value={agency.partnerId ?? ""}>
            <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
          </CopyableText>{" "}
          ·{" "}
          {seatCount + 1} team member{seatCount === 0 ? "" : "s"} on the {agency.plan} plan
        </>
      }
      topActions={
        <>
          <input className={shell.search} placeholder="Search client sites…" />
          <Link className={`${shell.btn} ${shell.btnPrimary}`} href={`${basePath}/sites/new`}>
            + New client
          </Link>
        </>
      }
    >
      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Client sites</div>
          <div className={shell.value}>{totalSites}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Published this month</div>
          <div className={shell.value}>{publishedThisMonth}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Team seats</div>
          <div className={shell.value}>{seatCount + 1}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Plan</div>
          <div className={styles.planValue}>{agency.plan}</div>
        </div>
      </div>

      <div className={shell.panel}>
        <div className={shell.panelHead}>
          <h2>Recent sites</h2>
          <Link className={`${shell.btn} ${shell.btnSmall}`} href={`${basePath}/sites`}>
            View all {totalSites}
          </Link>
        </div>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
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
                      <div className={styles.nameCell}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {logos.get(site.id) ? (
                          <img
                            className={styles.siteThumb}
                            src={logos.get(site.id)}
                            alt=""
                            style={{ objectFit: "contain" }}
                          />
                        ) : (
                          <div className={styles.siteThumb} />
                        )}
                        <div>
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
                          <div className={shell.rowSub}>
                            {site.domain ?? "not yet published"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`${shell.pill} ${shell[pill.cls]}`}>
                        {pill.label}
                      </span>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
              {siteList.length === 0 && (
                <tr>
                  <td colSpan={4} className={shell.rowSub}>
                    No client sites yet — start one from the landing page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
