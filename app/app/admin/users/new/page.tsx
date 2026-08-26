import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { createUserAction } from "@/app/actions/users";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { error } = await searchParams;

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/users"
      userName={profile.fullName}
      userRole="Super admin"
      title="New user"
      subtitle="Invites them by email — no password to set here"
    >
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 420, padding: "1.4rem" }}>
        <form action={createUserAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Full name
            </label>
            <input name="fullName" required placeholder="Jordan Lee" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Email
            </label>
            <input name="email" type="email" required placeholder="jordan@example.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Role
            </label>
            <select name="role" defaultValue="smb_owner" style={inputStyle}>
              <option value="smb_owner">Site owner (SMB)</option>
              <option value="super_admin">Super admin</option>
            </select>
            <p className={shell.rowSub} style={{ marginTop: "0.4rem" }}>
              Agency roles are assigned via &quot;+ New agency&quot; or a team invite, since
              they need to be tied to a specific agency.
            </p>
          </div>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Send invite
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
