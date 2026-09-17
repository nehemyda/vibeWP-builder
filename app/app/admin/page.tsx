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
          <div className={shell.label}>AI spend (MTD)</div>
          <div className={shell.value}>$9,340</div>
          <div className={`${shell.delta} ${shell.deltaWarn}`}>illustrative — mocked AI</div>
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

        <div className={shell.panel} style={{ padding: "1.2rem 1.3rem" }}>
          <h2 style={{ margin: "0 0 0.2rem", fontSize: "1rem" }}>AI provider mix</h2>
          <p className={styles.mutedNote}>Illustrative — real usage metering isn&apos;t wired up yet.</p>
          <div className={styles.providerBar}>
            <span style={{ width: "54%", background: "#5b6bff" }} />
            <span style={{ width: "31%", background: "#ff7a45" }} />
            <span style={{ width: "15%", background: "#17875a" }} />
          </div>
          <div className={styles.legend}>
            <span>Claude 54%</span>
            <span>GPT 31%</span>
            <span>Gemini 15%</span>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
