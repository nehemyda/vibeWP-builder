import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, leads, type sites, type profiles } from "@/lib/db/schema";
import type { resolveSitePaths } from "@/lib/site-paths";
import { daysSince } from "@/lib/time";
import { siteUsageSummary } from "@/lib/ai/usage-summary";
import { CREDIT_TOKENS } from "@/lib/ai/usage";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import styles from "../smb.module.css";
import { smbNav } from "../nav";

type Profile = typeof profiles.$inferSelect;
type Site = typeof sites.$inferSelect;
type Role = Profile["role"];
type Paths = Awaited<ReturnType<typeof resolveSitePaths>>;

export async function OverviewView({
  profile,
  role,
  site,
  paths,
}: {
  profile: Profile;
  role: Role;
  site: Site | undefined;
  paths: Paths | null;
}) {
  const firstName = profile.fullName.split(" ")[0];

  if (!site || !paths) {
    return (
      <DashboardShell
        navGroups={smbNav(null)}
        activeHref="/dashboard"
        userName={profile.fullName}
        userRole={role === "smb_owner" ? "Site owner" : "Team member"}
        title={`Welcome, ${firstName}`}
        subtitle={role === "smb_owner" ? "You don't have a site yet." : "You haven't been added to a site yet."}
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          <Link className={`${shell.btn} ${shell.btnPrimary}`} href="/">
            Start building your site
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const recentLeads = await db.query.leads.findMany({
    where: eq(leads.siteId, site.id),
    orderBy: [desc(leads.receivedAt)],
    limit: 5,
  });

  const daysLive = daysSince(site.createdAt);
  const usage = await siteUsageSummary(site.id, { days: 30 });

  const agency = site.agencyId
    ? await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) })
    : null;

  return (
    <DashboardShell
      navGroups={smbNav(paths, Boolean(site.intakeCompletedAt))}
      activeHref={paths.dashboardPath}
      userName={profile.fullName}
      userRole={site.name}
      title={`Welcome back, ${firstName}`}
      subtitle={
        agency ? (
          <>
            Managed by {agency.name} · Partner{" "}
            <CopyableText value={agency.partnerId ?? ""}>
              <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
            </CopyableText>
          </>
        ) : (
          "Here's how your site is doing"
        )
      }
      topActions={
        <>
          {site.domain && (
            <a className={shell.btn} href={`https://${site.domain}`} target="_blank" rel="noreferrer">
              View live site ↗
            </a>
          )}
          <a className={`${shell.btn} ${shell.btnPrimary}`} href={paths.builderPath}>
            Edit my site
          </a>
        </>
      }
    >
      <div className={`${shell.panel} ${styles.heroCard}`}>
        <div className={styles.sitePreview} />
        <div>
          <div className={styles.titleRow}>
            <h2>{site.domain ?? site.name}</h2>
            <span
              className={`${shell.pill} ${
                site.status === "live" ? shell.pillLive : shell.pillDraft
              }`}
            >
              {site.status === "live" ? "Live" : "Draft"}
            </span>
            <CopyableText value={site.smbId ?? ""}>
              <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
            </CopyableText>
          </div>
          <p className={styles.blurb}>
            {site.status === "live"
              ? `Your site was published ${daysLive} day${daysLive === 1 ? "" : "s"} ago and is running on your own WordPress hosting — fully exportable, no lock-in.`
              : "Your site is still in the builder — publish when you're ready to go live."}
          </p>
          <div className={styles.miniStats}>
            <div className={shell.statCard}>
              <div className={shell.label}>Visitors (30d)</div>
              <div className={styles.miniValue}>—</div>
            </div>
            <div className={shell.statCard}>
              <div className={shell.label}>Form submissions</div>
              <div className={styles.miniValue}>{recentLeads.length}</div>
            </div>
            <div className={shell.statCard}>
              <div className={shell.label}>AI credits (30d)</div>
              <div className={styles.miniValue}>{usage.credits}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={shell.twoCol}>
        <div className={shell.panel}>
          <div className={shell.panelHead}>
            <h2>Recent leads</h2>
            <Link className={`${shell.btn} ${shell.btnSmall}`} href={paths.leadsPath}>
              View all
            </Link>
          </div>
          <div className={shell.tableWrap}>
            <table className={shell.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Message</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td className={shell.rowName}>{lead.name}</td>
                    <td className={shell.rowSub}>{lead.message}</td>
                    <td>{lead.receivedAt.toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentLeads.length === 0 && (
                  <tr>
                    <td colSpan={3} className={shell.rowSub}>
                      No leads yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.upgradeCard}>
          <div className={styles.upgradeEyebrow}>Growth plan</div>
          <h3>Add a booking page</h3>
          <p>
            Let customers schedule appointments directly from your site.
            Included free on Growth.
          </p>
          <a className={`${shell.btn} ${shell.btnPrimary}`} style={{ width: "100%", justifyContent: "center" }}>
            Upgrade plan
          </a>
        </div>
      </div>

      <div className={shell.panel}>
        <div className={shell.panelHead}>
          <h2>AI usage</h2>
          <span className={shell.rowSub}>Last 30 days</span>
        </div>
        {usage.calls === 0 ? (
          <p className={shell.rowSub} style={{ margin: 0, padding: "1rem 1.3rem" }}>
            Nothing yet. Building a page, editing one, or describing images in the builder uses AI, and
            shows up here.
          </p>
        ) : (
          <>
            <div className={shell.tableWrap}>
              <table className={shell.table}>
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Times</th>
                    <th>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byAction.map((line) => (
                    <tr key={line.action}>
                      <td className={shell.rowName}>{line.label}</td>
                      <td>{line.calls}</td>
                      <td>{line.credits}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={shell.rowName}>Total</td>
                    <td>{usage.calls}</td>
                    <td className={shell.rowName}>{usage.credits}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={shell.rowSub} style={{ margin: 0, padding: "0.9rem 1.3rem" }}>
              One credit is {CREDIT_TOKENS.toLocaleString()} tokens of AI work, counted from the total.
              {usage.lastAt ? ` Last used ${usage.lastAt.toLocaleDateString()}.` : ""} No allowance is set on your
              plan yet — this is simply what your site has used.
            </p>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
