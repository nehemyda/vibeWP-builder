import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import { PlanSelect } from "@/components/dashboard/PlanSelect";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";
import { createAgencyAction } from "@/app/actions/admin";

export default async function NewAgencyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { error } = await searchParams;

  const userList = await db.query.profiles.findMany({
    orderBy: [desc(profiles.createdAt)],
  });

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/agencies"
      userName={profile.fullName}
      userRole="Super admin"
      title="New agency"
      subtitle="Create an agency and invite its owner"
    >
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 720, padding: "1.4rem" }}>
        <form action={createAgencyAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              htmlFor="name"
              style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
            >
              Agency name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="Acme Web Co."
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.9rem",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="plan"
              style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
            >
              Plan
            </label>
            <PlanSelect
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.9rem",
              }}
            />
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem" }}>Owner — invite a new person</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
              <div>
                <label
                  htmlFor="ownerFullName"
                  style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
                >
                  Owner full name
                </label>
                <input
                  id="ownerFullName"
                  name="ownerFullName"
                  placeholder="Jordan Lee"
                  style={{
                    width: "100%",
                    padding: "0.7rem 0.9rem",
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="ownerEmail"
                  style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
                >
                  Owner email
                </label>
                <input
                  id="ownerEmail"
                  name="ownerEmail"
                  type="email"
                  placeholder="jordan@agency.com"
                  style={{
                    width: "100%",
                    padding: "0.7rem 0.9rem",
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            </div>
            <p className={shell.rowSub} style={{ marginTop: "0.6rem", marginBottom: 0 }}>
              Sends a real invite email via Supabase and sets their role to agency_owner. Leave blank and pick an
              existing user below instead.
            </p>
          </div>

          {userList.length > 0 && (
            <div>
              <label
                htmlFor="ownerUserId"
                style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
              >
                Owner — or assign an existing user instead
              </label>
              <select
                id="ownerUserId"
                name="ownerUserId"
                defaultValue=""
                style={{
                  width: "100%",
                  padding: "0.7rem 0.9rem",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  fontSize: "0.9rem",
                }}
              >
                <option value="">— none —</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role})
                  </option>
                ))}
              </select>
              <p className={shell.rowSub} style={{ marginTop: "0.4rem" }}>
                This user&apos;s role will be set to agency_owner. Only used if the invite fields above are left blank.
              </p>
            </div>
          )}

          <div>
            <h2 style={{ margin: "0.5rem 0 1rem", fontSize: "0.95rem" }}>Business details</h2>
            <BusinessDetailsFields profile={null} />
          </div>

          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Create agency
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
