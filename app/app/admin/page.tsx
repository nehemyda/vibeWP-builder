import { sql, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, sites, plans } from "@/lib/db/schema";
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AdminSearch } from "@/components/dashboard/AdminSearch";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import styles from "./admin.module.css";
import { ADMIN_NAV } from "./nav";
import { planLabel } from "@/lib/billing";
import { platformUsageSummary } from "@/lib/ai/usage-summary";
import { CREDIT_TOKENS } from "@/lib/ai/usage";

export default async function AdminDashboardPage() {
  const { profile } = await requireRole(["super_admin"]);

  const [agencyList, [{ count: liveSiteCount }], [{ count: agencyCount }]] =
    await Promise.all([
      db.query.agencies.findMany({ orderBy: (a, { desc }) => [desc(a.createdAt)] }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(and(sql`${sites.status} = 'live'`, isNull(sites.deletedAt))),
      db.select({ count: sql<number>`count(*)::int` }).from(agencies),
    ]);

  const siteCountsByAgency = await db
    .select({ agencyId: sites.agencyId, count: sql<number>`count(*)::int` })
    .from(sites)
    .where(isNull(sites.deletedAt))
    .groupBy(sites.agencyId);
  const siteCountMap = new Map(
    siteCountsByAgency.map((r) => [r.agencyId, r.count]),
  );

  /* Agencies store the plan KEY; the catalogue carries the name an admin
     actually edits at /admin/billing. */
  const planCatalogue = await db.select({ key: plans.key, name: plans.name }).from(plans);
  const usage = await platformUsageSummary({ days: 30 });

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin"
      userName={profile.fullName}
      userRole="Super admin"
      title="Platform overview"
      subtitle="Across every agency and SMB site on VibeWP"
      topActions={
        <>
          <AdminSearch />
          <a className={shell.btn} href="/admin/export">
            Export report
          </a>
          <Link className={`${shell.btn} ${shell.btnPrimary}`} href="/admin/agencies/new">
            + New agency
          </Link>
        </>
      }
    >
      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Active agencies</div>
          <div className={shell.value}>{agencyCount}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Live sites</div>
          <div className={shell.value}>{liveSiteCount}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Platform MRR</div>
          <div className={shell.value}>$184.2k</div>
          <div className={`${shell.delta} ${shell.deltaUp}`}>illustrative — no billing yet</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>AI credits (30d)</div>
          <div className={shell.value}>{usage.credits.toLocaleString()}</div>
          <div className={shell.delta}>
            {usage.requests.toLocaleString()} request{usage.requests === 1 ? "" : "s"} · {usage.totalTokens.toLocaleString()} tokens
          </div>
        </div>
      </div>

      <div className={shell.twoCol}>
        <div className={shell.panel}>
          <div className={shell.panelHead}>
            <h2>Agencies</h2>
            <Link className={`${shell.btn} ${shell.btnSmall}`} href="/admin/agencies">
              View all
            </Link>
          </div>
          <div className={shell.tableWrap}>
            <table className={shell.table}>
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Plan</th>
                  <th>Sites</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agencyList.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className={shell.rowName}>{a.name}</div>
                      <div className={shell.rowSub}>
                        joined {a.createdAt.toLocaleDateString()}
                      </div>
                    </td>
                    <td>{planLabel(a.plan, planCatalogue)}</td>
                    <td>{siteCountMap.get(a.id) ?? 0}</td>
                    <td>
                      <span className={`${shell.pill} ${shell.pillLive}`}>Active</span>
                    </td>
                  </tr>
                ))}
                {agencyList.length === 0 && (
                  <tr>
                    <td colSpan={4} className={shell.rowSub}>
                      No agencies yet — run the seed script or sign up an agency account.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/*
          Real, from the ledger. This panel was an illustrative provider mix —
          "Claude 54%, GPT 31%" — drawn in CSS with no data behind it. Every
          call is recorded now, so it shows what was actually spent, by the
          agency it was spent under, and which models did the work.
        */}
        <div className={shell.panel}>
          <div className={shell.panelHead}>
            <h2>AI usage</h2>
            <span className={shell.rowSub}>Last 30 days</span>
          </div>
          {usage.requests === 0 ? (
            <p className={shell.rowSub} style={{ margin: 0, padding: "1rem 1.3rem" }}>
              No AI work recorded yet.
            </p>
          ) : (
            <>
              <div className={shell.tableWrap}>
                <table className={shell.table}>
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Sites</th>
                      <th>Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byAgency.map((row) => (
                      <tr key={row.agencyId ?? "direct"}>
                        <td className={shell.rowName}>
                          {row.partnerId ? <Link href={`/admin/agencies/${row.partnerId}`}>{row.name}</Link> : row.name}
                        </td>
                        <td>{row.sites}</td>
                        <td>{row.credits}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={shell.rowName}>Total</td>
                      <td>{usage.byAgency.reduce((n, r) => n + r.sites, 0)}</td>
                      <td className={shell.rowName}>{usage.credits}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={styles.legend} style={{ padding: "0.9rem 1.3rem" }}>
                {usage.byModel.map((m) => (
                  <span key={m.model}>
                    {m.model} {Math.round(m.share * 100)}%
                  </span>
                ))}
              </div>
              <p className={shell.rowSub} style={{ margin: 0, padding: "0 1.3rem 0.9rem" }}>
                One credit is {CREDIT_TOKENS.toLocaleString()} tokens. Spend is booked to the agency a site belonged
                to at the time.
              </p>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
