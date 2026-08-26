import { sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { parsePage, pageOffset, totalPages } from "@/lib/pagination";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

const ACTIVITY_PAGE_SIZE = 15;

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const page = parsePage((await searchParams).page);

  const [entries, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(ACTIVITY_PAGE_SIZE)
      .offset(pageOffset(page, ACTIVITY_PAGE_SIZE)),
    db.select({ count: sql<number>`count(*)::int` }).from(activityLog),
  ]);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/activity"
      userName={profile.fullName}
      userRole="Super admin"
      title="Activity log"
      subtitle="Who did what, across every agency, user, and site"
    >
      <div className={shell.panel}>
        <ActivityFeed entries={entries} />
        <div style={{ padding: "1rem 1.3rem" }}>
          <Pagination
            page={page}
            totalPages={totalPages(totalCount, ACTIVITY_PAGE_SIZE)}
            basePath="/admin/activity"
          />
        </div>
      </div>
    </DashboardShell>
  );
}
