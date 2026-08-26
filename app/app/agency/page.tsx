import { redirect } from "next/navigation";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { agencyNav } from "./nav";

/** Bare entry point — forwards to the Partner-ID-ful canonical URL. */
export default async function AgencyIndexPage() {
  const { profile, agency } = await requireAgency();

  if (agency) redirect(`/agency/${agency.partnerId}`);

  return (
    <DashboardShell
      navGroups={agencyNav("Your agency", null)}
      activeHref="/agency"
      userName={profile.fullName}
      userRole="Agency owner"
      title="No agency found"
      subtitle="This account isn't linked to an agency yet."
    >
      <div className={shell.panel} style={{ padding: "1.3rem" }}>
        Ask a super admin to link your account to an agency, or create one
        from the registration flow.
      </div>
    </DashboardShell>
  );
}
