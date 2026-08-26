import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { UserTabs } from "@/components/dashboard/UserTabs";
import { updateRolePermissionsAction } from "@/app/actions/permissions";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";

const ROLES = [
  { key: "super_admin", label: "Super admin" },
  { key: "agency_owner", label: "Agency owner" },
  { key: "agency_member", label: "Agency member" },
  { key: "smb_owner", label: "Site owner" },
  { key: "smb_member", label: "Site team member" },
] as const;

export default async function RolesPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved } = await searchParams;

  const [allPermissions, allGrants] = await Promise.all([
    db.query.permissions.findMany(),
    db.query.rolePermissions.findMany(),
  ]);

  const grantSet = new Set(allGrants.map((g) => `${g.role}|${g.permissionKey}`));
  const categories = Array.from(new Set(allPermissions.map((p) => p.category)));

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/users"
      userName={profile.fullName}
      userRole="Super admin"
      title="Roles & Permissions"
      subtitle="What each role is allowed to do — changes take effect immediately, including for your own role"
    >
      <UserTabs active="permissions" />

      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <form action={updateRolePermissionsAction}>
        {allPermissions.map((p) => (
          <input key={p.key} type="hidden" name="permissionKeys[]" value={p.key} />
        ))}

        {categories.map((category) => (
          <div key={category} className={shell.panel} style={{ marginBottom: "1.2rem" }}>
            <div className={shell.panelHead}>
              <h2>{category}</h2>
            </div>
            <div className={shell.tableWrap}>
              <table className={shell.table}>
                <thead>
                  <tr>
                    <th>Permission</th>
                    {ROLES.map((r) => (
                      <th key={r.key} style={{ textAlign: "center" }}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPermissions
                    .filter((p) => p.category === category)
                    .map((p) => (
                      <tr key={p.key}>
                        <td>
                          <div className={shell.rowName}>{p.label}</div>
                          <div className={shell.rowSub}>{p.description}</div>
                        </td>
                        {ROLES.map((r) => (
                          <td key={r.key} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              name={`grant__${r.key}__${p.key}`}
                              defaultChecked={grantSet.has(`${r.key}|${p.key}`)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
          Save permissions
        </button>
      </form>
    </DashboardShell>
  );
}
