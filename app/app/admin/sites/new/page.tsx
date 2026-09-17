import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import { createSiteAction } from "@/app/actions/admin-sites";
import { PlanSelect } from "@/components/dashboard/PlanSelect";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;
const labelStyle = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
} as const;

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<{ agencyId?: string; error?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { agencyId, error } = await searchParams;

  const agencyList = await db.query.agencies.findMany({
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });
  const preselected = agencyList.find((a) => a.id === agencyId);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/agencies"
      userName={profile.fullName}
      userRole="Super admin"
      title="New SMB client"
      subtitle={preselected ? `For ${preselected.name}` : "Create an SMB client and invite its owner"}
    >
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 720, padding: "1.4rem" }}>
        <form action={createSiteAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label htmlFor="name" style={labelStyle}>
              Site name
            </label>
            <input id="name" name="name" required placeholder="PIPEPRO Plumbing" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
            <div>
              <label htmlFor="domain" style={labelStyle}>
                Domain
              </label>
              <input id="domain" name="domain" placeholder="yourbusiness.com" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="plan" style={labelStyle}>
                Plan
              </label>
              <PlanSelect style={inputStyle} />
            </div>
          </div>

          <div>
            <label htmlFor="agencyId" style={labelStyle}>
              Agency
            </label>
            <select id="agencyId" name="agencyId" defaultValue={agencyId ?? ""} style={inputStyle}>
              <option value="">— None (direct SMB) —</option>
              {agencyList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.partnerId})
                </option>
              ))}
            </select>
            <p className={shell.rowSub} style={{ marginTop: "0.4rem" }}>
              Leave unset for a site owned directly by its SMB owner, with no agency involved.
            </p>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem" }}>Owner</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
              <div>
                <label htmlFor="ownerFullName" style={labelStyle}>
                  Owner full name
                </label>
                <input id="ownerFullName" name="ownerFullName" required placeholder="Jordan Lee" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="ownerEmail" style={labelStyle}>
                  Owner email
                </label>
                <input
                  id="ownerEmail"
                  name="ownerEmail"
                  type="email"
                  required
                  placeholder="jordan@pipepro.com"
                  style={inputStyle}
                />
              </div>
            </div>
            <p className={shell.rowSub} style={{ marginTop: "0.6rem", marginBottom: 0 }}>
              Sends a real invite email via Supabase and sets their role to smb_owner.
            </p>
          </div>

          <div>
            <h2 style={{ margin: "0.5rem 0 1rem", fontSize: "0.95rem" }}>Business details</h2>
            <BusinessDetailsFields profile={null} />
          </div>

          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Create client
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
