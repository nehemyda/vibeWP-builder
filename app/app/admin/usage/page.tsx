import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { platformUsageBreakdown, platformUsageSummary } from "@/lib/ai/usage-summary";
import { CREDIT_TOKENS } from "@/lib/ai/usage";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

/**
 * Usage & cost, for the super admin.
 *
 * The sidebar link existed before the page did — it pointed at /admin and
 * lit up beside Overview. Now that every model call is in the ledger this is
 * where the questions an allowance depends on get answered: who spends, on
 * what, and how much one request of each kind costs.
 *
 * Nothing here is enforced. Credits are the summed tokens at 1,000 a credit;
 * "cost" is in credits because no price is attached to one yet.
 */

const PERIODS = [7, 30, 90] as const;

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const requested = Number((await searchParams).days);
  const days = (PERIODS as readonly number[]).includes(requested) ? requested : 30;

  const [summary, breakdown] = await Promise.all([
    platformUsageSummary({ days }),
    platformUsageBreakdown({ days }),
  ]);
  const perRequest = summary.requests ? Math.round(summary.totalTokens / summary.requests) : 0;

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/usage"
      userName={profile.fullName}
      userRole="Super admin"
      title="Usage & cost"
      subtitle={`AI work across every site, last ${days} days — one credit is ${CREDIT_TOKENS.toLocaleString()} tokens`}
      topActions={
        <>
          {PERIODS.map((p) => (
            <Link
              key={p}
              className={`${shell.btn} ${p === days ? shell.btnPrimary : ""}`}
              href={p === 30 ? "/admin/usage" : `/admin/usage?days=${p}`}
            >
              {p} days
            </Link>
          ))}
        </>
      }
    >
      <div className={shell.statsRow}>
        <div className={shell.statCard}>
          <div className={shell.label}>Credits</div>
          <div className={shell.value}>{summary.credits.toLocaleString()}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Requests</div>
          <div className={shell.value}>{summary.requests.toLocaleString()}</div>
          <div className={shell.delta}>things clients asked for, not model calls</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Tokens</div>
          <div className={shell.value}>{summary.totalTokens.toLocaleString()}</div>
        </div>
        <div className={shell.statCard}>
          <div className={shell.label}>Tokens per request</div>
          <div className={shell.value}>{perRequest.toLocaleString()}</div>
          <div className={shell.delta}>the number an allowance is set from</div>
        </div>
      </div>

      {summary.requests === 0 ? (
        <div className={shell.panel}>
          <p className={shell.rowSub} style={{ margin: 0, padding: "1rem 1.3rem" }}>
            No AI work recorded in the last {days} days.
          </p>
        </div>
      ) : (
        <>
          <div className={shell.twoCol}>
            <div className={shell.panel}>
              <div className={shell.panelHead}>
                <h2>By what clients were doing</h2>
                <span className={shell.rowSub}>where the tokens go</span>
              </div>
              <div className={shell.tableWrap}>
                <table className={shell.table}>
                  <thead>
                    <tr>
                      <th>What</th>
                      <th>Requests</th>
                      <th>Tokens / request</th>
                      <th>Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.byAction.map((row) => (
                      <tr key={row.action}>
                        <td className={shell.rowName}>{row.label}</td>
                        <td>{row.requests.toLocaleString()}</td>
                        <td>{row.tokensPerRequest.toLocaleString()}</td>
                        <td>{row.credits.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={shell.panel}>
              <div className={shell.panelHead}>
                <h2>By agency</h2>
                <span className={shell.rowSub}>booked to the agency at the time</span>
              </div>
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
                    {summary.byAgency.map((row) => (
                      <tr key={row.agencyId ?? "direct"}>
                        <td className={shell.rowName}>
                          {row.partnerId ? <Link href={`/admin/agencies/${row.partnerId}`}>{row.name}</Link> : row.name}
                        </td>
                        <td>{row.sites}</td>
                        <td>{row.credits.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={shell.rowSub} style={{ margin: 0, padding: "0.9rem 1.3rem" }}>
                Models: {summary.byModel.map((m) => `${m.model} ${Math.round(m.share * 100)}%`).join(" · ")}
              </p>
            </div>
          </div>

          <div className={shell.panel} style={{ marginTop: "1.2rem" }}>
            <div className={shell.panelHead}>
              <h2>By site</h2>
              <span className={shell.rowSub}>highest spend first · top {breakdown.bySite.length}</span>
            </div>
            <div className={shell.tableWrap}>
              <table className={shell.table}>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Agency</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.bySite.map((row) => (
                    <tr key={row.siteId}>
                      <td className={shell.rowName}>
                        {row.smbId ? <Link href={`/admin/sites/${row.smbId}`}>{row.name}</Link> : row.name}
                      </td>
                      <td className={shell.rowSub}>
                        {row.partnerId ? <Link href={`/admin/agencies/${row.partnerId}`}>{row.agencyName}</Link> : "Direct"}
                      </td>
                      <td>{row.requests.toLocaleString()}</td>
                      <td>{row.tokens.toLocaleString()}</td>
                      <td>{row.credits.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
