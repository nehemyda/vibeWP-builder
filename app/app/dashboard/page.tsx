import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSmbSite } from "@/lib/auth/require-site";
import { resolveSitePaths } from "@/lib/site-paths";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { smbNav } from "./nav";

/** Bare entry point — forwards to the canonical (nested-if-agency-managed) URL. */
export default async function SmbDashboardIndexPage() {
  const { profile, site } = await requireSmbSite();

  if (site) {
    const { dashboardPath } = await resolveSitePaths(site);
    redirect(dashboardPath);
  }

  const firstName = profile.fullName.split(" ")[0];

  return (
    <DashboardShell
      navGroups={smbNav(null)}
      activeHref="/dashboard"
      userName={profile.fullName}
      userRole="Site owner"
      title={`Welcome, ${firstName}`}
      subtitle="You don't have a site yet."
    >
      <div className={shell.panel} style={{ padding: "1.3rem" }}>
        <Link className={`${shell.btn} ${shell.btnPrimary}`} href="/">
          Start building your site
        </Link>
      </div>
    </DashboardShell>
  );
}
