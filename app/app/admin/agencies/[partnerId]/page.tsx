import { notFound } from "next/navigation";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, profiles, agencyMembers, sites, businessProfiles, activityLog } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { parsePage, pageOffset, totalPages, PAGE_SIZE } from "@/lib/pagination";
import { startImpersonationAction } from "@/app/actions/impersonation";
import { upsertBusinessProfileAction } from "@/app/actions/business-profile";
import { deleteSiteAction } from "@/app/actions/sites";
import {
  updateAgencyAction,
  suspendAgencyAction,
  reactivateAgencyAction,
  archiveAgencyAction,
  restoreAgencyAction,
  deleteAgencyAction,
} from "@/app/actions/admin";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";

function sitePillFor(status: string) {
  if (status === "live") return { cls: "pillLive", label: "Live" };
  if (status === "trial") return { cls: "pillTrial", label: "Trial" };
  return { cls: "pillDraft", label: "Draft" };
}

function agencyStatusPill(status: string) {
  if (status === "active") return { cls: "pillLive", label: "Active" };
  if (status === "suspended") return { cls: "pillWarn", label: "Suspended" };
  if (status === "archived") return { cls: "pillDraft", label: "Archived" };
  return { cls: "pillDanger", label: "Deleted" };
}

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;
const labelStyle = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
} as const;

export default async function AgencyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ page?: string; saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { partnerId } = await params;
  const { page: pageParam, saved } = await searchParams;
  const page = parsePage(pageParam);

  const agency = await db.query.agencies.findFirst({ where: eq(agencies.partnerId, partnerId) });
  if (!agency) notFound();

  const owner = await db.query.profiles.findFirst({ where: eq(profiles.id, agency.ownerUserId) });

  const members = await db
    .select({ id: profiles.id, fullName: profiles.fullName, role: agencyMembers.role })
    .from(agencyMembers)
    .innerJoin(profiles, eq(profiles.id, agencyMembers.userId))
    .where(eq(agencyMembers.agencyId, agency.id));

  const businessProfile = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerType, "agency"), eq(businessProfiles.ownerId, agency.id)),
  });

  const [siteList, [{ count: totalSites }], [{ count: liveSites }], recentActivity] = await Promise.all([
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
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(sql`${sites.agencyId} = ${agency.id} and ${sites.status} = 'live' and ${sites.deletedAt} is null`),
    db
      .select()
      .from(activityLog)
      .where(sql`${activityLog.targetType} = 'agency' and ${activityLog.targetId} = ${agency.id}`)
      .orderBy(desc(activityLog.createdAt))
      .limit(15),
  ]);

  const statusPill = agencyStatusPill(agency.status);
  const redirectTo = `/admin/agencies/${agency.partnerId}`;

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/agencies"
      userName={profile.fullName}
      userRole="Super admin"
      title={agency.name}
      subtitle={
        <>
          Partner ID <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span> · {agency.plan} plan ·{" "}
          <span className={`${shell.pill} ${shell[statusPill.cls] ?? ""}`}>{statusPill.label}</span>
        </>
      }
      topActions={
        <>
          {agency.status === "active" && (
            <form action={startImpersonationAction.bind(null, agency.ownerUserId)}>
              <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
                View agency dashboard ↗
              </button>
            </form>
          )}
          {agency.status === "active" && (
            <form action={suspendAgencyAction.bind(null, agency.id, agency.partnerId ?? "")}>
              <ConfirmSubmitButton
                confirmMessage={`Suspend ${agency.name}? Their team won't be able to log in until reactivated.`}
                className={shell.btn}
              >
                Suspend
              </ConfirmSubmitButton>
            </form>
          )}
          {agency.status === "suspended" && (
            <form action={reactivateAgencyAction.bind(null, agency.id, agency.partnerId ?? "")}>
              <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
                Reactivate
              </button>
            </form>
          )}
          {(agency.status === "active" || agency.status === "suspended") && (
            <form action={archiveAgencyAction.bind(null, agency.id, agency.partnerId ?? "")}>
              <ConfirmSubmitButton confirmMessage={`Archive ${agency.name}?`} className={shell.btn}>
                Archive
              </ConfirmSubmitButton>
            </form>
          )}
          {(agency.status === "archived" || agency.status === "deleted") && (
            <form action={restoreAgencyAction.bind(null, agency.id, agency.partnerId ?? "")}>
              <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
                Restore
              </button>
            </form>
          )}
          {agency.status !== "deleted" && (
            <form action={deleteAgencyAction.bind(null, agency.id, agency.partnerId ?? "")}>
              <ConfirmSubmitButton
                confirmMessage={`Delete ${agency.name}? This hides it and blocks their login, but keeps all data — you can restore it later.`}
                className={shell.btn}
              >
                Delete
              </ConfirmSubmitButton>
            </form>
          )}
        </>
      }
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Client sites</div>
          <div className={shell.value}>{totalSites}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Live sites</div>
          <div className={shell.value}>{liveSites}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Team seats</div>
          <div className={shell.value}>{members.length + 1}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Joined</div>
          <div className={shell.value} style={{ fontSize: "1.3rem" }}>
            {agency.createdAt.toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className={shell.twoCol} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Agency info</h2>
          <form action={updateAgencyAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <input type="hidden" name="agencyId" value={agency.id} />
            <input type="hidden" name="partnerId" value={agency.partnerId ?? ""} />
            <div>
              <div style={labelStyle}>Partner ID</div>
              <CopyableText value={agency.partnerId ?? ""}>
                <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
              </CopyableText>
            </div>
            <div>
              <label htmlFor="owner" style={labelStyle}>
                Owner
              </label>
              <p id="owner" style={{ margin: 0 }}>
                {owner?.fullName ? <CopyableText value={owner.fullName}>{owner.fullName}</CopyableText> : "—"}
              </p>
            </div>
            <div>
              <label htmlFor="name" style={labelStyle}>
                Agency name
              </label>
              <input id="name" name="name" defaultValue={agency.name} required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="plan" style={labelStyle}>
                Plan
              </label>
              <select id="plan" name="plan" defaultValue={agency.plan} style={inputStyle}>
                <option>Starter</option>
                <option>Growth</option>
                <option>Scale</option>
                <option>Agency</option>
              </select>
            </div>
            <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
              Save
            </button>
          </form>
        </div>

        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Team</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong>{owner?.fullName ?? "—"}</strong> <span className={shell.rowSub}>Owner</span>
            </li>
            {members.map((m) => (
              <li key={m.id} style={{ marginBottom: "0.5rem" }}>
                {m.fullName} <span className={shell.rowSub}>{m.role}</span>
              </li>
            ))}
            {members.length === 0 && <li className={shell.rowSub}>No other team members yet.</li>}
          </ul>
        </div>
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Business details</h2>
        <form
          action={upsertBusinessProfileAction}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <input type="hidden" name="ownerType" value="agency" />
          <input type="hidden" name="ownerId" value={agency.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <BusinessDetailsFields profile={businessProfile ?? null} />
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
            Save business details
          </button>
        </form>
      </div>

      <div className={shell.panel} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.panelHead}>
          <h2>Client sites</h2>
          <a className={`${shell.btn} ${shell.btnSmall}`} href={`/admin/sites/new?agencyId=${agency.id}`}>
            + New client
          </a>
        </div>
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
                const pill = sitePillFor(site.status);
                return (
                  <tr key={site.id}>
                    <td>
                      <CopyableText value={site.smbId ?? ""}>
                        <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
                      </CopyableText>
                    </td>
                    <td>
                      <CopyableText value={site.name}>
                        <div className={shell.rowName}>{site.name}</div>
                      </CopyableText>
                      <div className={shell.rowSub}>{site.domain ?? "not yet published"}</div>
                    </td>
                    <td>
                      <span className={`${shell.pill} ${shell[pill.cls]}`}>{pill.label}</span>
                    </td>
                    <td>{site.lastEditedAt.toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                        <a
                          className={`${shell.btn} ${shell.btnSmall}`}
                          href={`/admin/agencies/${agency.partnerId}/sites/${site.smbId}`}
                        >
                          View
                        </a>
                        <a
                          className={`${shell.btn} ${shell.btnSmall}`}
                          href={`/builder/${agency.partnerId}/${site.smbId}`}
                        >
                          Open in builder
                        </a>
                        <form action={startImpersonationAction.bind(null, site.ownerUserId)}>
                          <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                            Dashboard
                          </button>
                        </form>
                        <form action={deleteSiteAction.bind(null, site.id, redirectTo)}>
                          <ConfirmSubmitButton
                            confirmMessage={`Delete ${site.name}? This hides it but keeps all leads and builder content — recoverable.`}
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
        <Pagination page={page} totalPages={totalPages(totalSites)} basePath={redirectTo} />
      </div>

      <div className={shell.panel}>
        <div className={shell.panelHead}>
          <h2>Recent activity</h2>
        </div>
        <ActivityFeed entries={recentActivity} />
      </div>
    </DashboardShell>
  );
}
