import { redirect } from "next/navigation";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import { createAgencySiteAction } from "@/app/actions/agency-sites";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { agencyNav } from "../../../nav";

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

export default async function AgencyNewSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { partnerId } = await params;
  const { profile, agency } = await requireAgency();
  const { error } = await searchParams;

  if (!agency) redirect("/agency");

  const basePath = `/agency/${agency.partnerId}`;
  if (agency.partnerId !== partnerId) {
    redirect(`${basePath}/sites/new`);
  }

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={`${basePath}/sites`}
      userName={profile.fullName}
      userRole="Agency owner"
      title="New SMB client"
      subtitle={`For ${agency.name}`}
    >
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 720, padding: "1.4rem" }}>
        <form action={createAgencySiteAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
              <select id="plan" name="plan" defaultValue={agency.plan} style={inputStyle}>
                <option>Starter</option>
                <option>Growth</option>
                <option>Scale</option>
              </select>
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem" }}>Client owner</h2>
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
              Sends a real invite email via Supabase. They get their own dashboard, scoped to this one site.
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
