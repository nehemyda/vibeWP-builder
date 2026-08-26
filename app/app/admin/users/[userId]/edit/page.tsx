import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { updateUserAction } from "@/app/actions/users";
import { createAdminClient } from "@/lib/supabase/admin";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../../nav";

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { userId } = await params;

  const targetUser = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  if (!targetUser) notFound();

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email ?? "—";

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/users"
      userName={profile.fullName}
      userRole="Super admin"
      title={`Edit ${targetUser.fullName}`}
      subtitle="Name and role — email and password are managed by the user themselves"
    >
      <div className={shell.panel} style={{ maxWidth: 420, padding: "1.4rem" }}>
        <form action={updateUserAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input type="hidden" name="userId" value={targetUser.id} />
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Email
            </label>
            <input value={email} readOnly disabled style={{ ...inputStyle, background: "var(--bg)", color: "var(--muted)" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Full name
            </label>
            <input name="fullName" defaultValue={targetUser.fullName} required style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Role
            </label>
            <select name="role" defaultValue={targetUser.role} style={inputStyle}>
              <option value="smb_owner">Site owner (SMB)</option>
              <option value="smb_member">Site team member</option>
              <option value="agency_owner">Agency owner</option>
              <option value="agency_member">Agency member</option>
              <option value="super_admin">Super admin</option>
            </select>
            <p className={shell.rowSub} style={{ marginTop: "0.4rem" }}>
              Changing to/from agency roles here does not create or remove agency
              associations — use the agency pages for that.
            </p>
          </div>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Save
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
