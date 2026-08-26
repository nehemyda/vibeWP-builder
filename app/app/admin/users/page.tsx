import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/dashboard/Pagination";
import { AdminSearch } from "@/components/dashboard/AdminSearch";
import { UserTabs } from "@/components/dashboard/UserTabs";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { parsePage, pageOffset, totalPages, PAGE_SIZE } from "@/lib/pagination";
import { deactivateUserAction, reactivateUserAction } from "@/app/actions/users";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  agency_owner: "Agency owner",
  agency_member: "Agency member",
  smb_owner: "Site owner",
  smb_member: "Site team member",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const page = parsePage((await searchParams).page);

  const [userList, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(profiles)
      .orderBy(desc(profiles.createdAt))
      .limit(PAGE_SIZE)
      .offset(pageOffset(page)),
    db.select({ count: sql<number>`count(*)::int` }).from(profiles),
  ]);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/users"
      userName={profile.fullName}
      userRole="Super admin"
      title="Users"
      subtitle={`${totalCount} accounts on the platform`}
      topActions={
        <>
          <AdminSearch />
          <Link className={`${shell.btn} ${shell.btnPrimary}`} href="/admin/users/new">
            + New user
          </Link>
        </>
      }
    >
      <UserTabs active="users" />

      <div className={shell.panel}>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <tr key={u.id}>
                  <td className={shell.rowName}>{u.fullName}</td>
                  <td>{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td>
                    <span className={`${shell.pill} ${u.active ? shell.pillLive : shell.pillDraft}`}>
                      {u.active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>{u.createdAt.toLocaleDateString()}</td>
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    <Link className={`${shell.btn} ${shell.btnSmall}`} href={`/admin/users/${u.id}/edit`}>
                      Edit
                    </Link>
                    {u.active ? (
                      <form action={deactivateUserAction.bind(null, u.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Deactivate ${u.fullName}? They won't be able to log in until reactivated.`}
                          className={`${shell.btn} ${shell.btnSmall}`}
                        >
                          Deactivate
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <form action={reactivateUserAction.bind(null, u.id)}>
                        <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                          Reactivate
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {userList.length === 0 && (
                <tr>
                  <td colSpan={5} className={shell.rowSub}>
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages(totalCount)} basePath="/admin/users" />
      </div>
    </DashboardShell>
  );
}
