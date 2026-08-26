import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, type sites, type profiles } from "@/lib/db/schema";
import type { resolveSitePaths } from "@/lib/site-paths";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { totalPages, PAGE_SIZE, pageOffset } from "@/lib/pagination";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { smbNav } from "../nav";

type Profile = typeof profiles.$inferSelect;
type Site = typeof sites.$inferSelect;
type Role = Profile["role"];
type Paths = Awaited<ReturnType<typeof resolveSitePaths>>;

export async function LeadsView({
  profile,
  role,
  site,
  paths,
  page,
}: {
  profile: Profile;
  role: Role;
  site: Site | undefined;
  paths: Paths | null;
  page: number;
}) {
  if (!site || !paths) {
    return (
      <DashboardShell
        navGroups={smbNav(null)}
        activeHref="/dashboard"
        userName={profile.fullName}
        userRole={role === "smb_owner" ? "Site owner" : "Team member"}
        title="Leads & forms"
        subtitle="You don't have a site yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Start building your site from the landing page first.
        </div>
      </DashboardShell>
    );
  }

  const [allLeads, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(eq(leads.siteId, site.id))
      .orderBy(desc(leads.receivedAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.siteId, site.id)),
  ]);

  return (
    <DashboardShell
      navGroups={smbNav(paths)}
      activeHref={paths.leadsPath}
      userName={profile.fullName}
      userRole={site.name}
      title="Leads & forms"
      subtitle={`${totalCount} submissions from ${site.name}`}
    >
      <div className={shell.panel}>
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
              {allLeads.map((lead) => (
                <tr key={lead.id}>
                  <td className={shell.rowName}>{lead.name}</td>
                  <td className={shell.rowSub}>{lead.message}</td>
                  <td>{lead.receivedAt.toLocaleDateString()}</td>
                </tr>
              ))}
              {allLeads.length === 0 && (
                <tr>
                  <td colSpan={3} className={shell.rowSub}>
                    No leads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages(totalCount)} basePath={paths.leadsPath} />
      </div>
    </DashboardShell>
  );
}
