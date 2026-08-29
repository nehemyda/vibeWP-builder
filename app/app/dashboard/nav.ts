import type { NavGroup } from "@/components/dashboard/DashboardShell";

export function smbNav(
  paths: {
    dashboardPath: string;
    builderPath: string;
    leadsPath?: string;
    teamPath?: string;
    billingPath?: string;
    settingsPath?: string;
  } | null,
  /**
   * Whether the intake form has ever been submitted for this site.
   *
   * Drives the label: a client who has never told us anything is being offered
   * something quite different from one coming back to adjust a heading, and
   * "Edit site" on an empty site invites the question "edit what?".
   *
   * Deliberately not inferred from page count — a site can hold pages from a
   * WordPress pull without anyone having filled the form.
   */
  intakeCompleted = true,
): NavGroup[] {
  const overviewHref = paths?.dashboardPath ?? "/dashboard";
  const editHref = paths?.builderPath ?? "/dashboard";
  const leadsHref = paths?.leadsPath ?? "/dashboard";
  const teamHref = paths?.teamPath ?? "/dashboard";
  const billingHref = paths?.billingPath ?? "/dashboard";
  const settingsHref = paths?.settingsPath ?? "/dashboard";
  return [
    {
      label: "My site",
      items: [
        { icon: "◆", label: "Overview", href: overviewHref },
        {
          icon: intakeCompleted ? "✏" : "✨",
          label: intakeCompleted ? "Edit my site" : "Build my site",
          href: editHref,
        },
        { icon: "📈", label: "Visitors", href: overviewHref },
        { icon: "✉", label: "Leads & forms", href: leadsHref },
        { icon: "👥", label: "Team", href: teamHref },
      ],
    },
    {
      label: "Account",
      items: [
        { icon: "💳", label: "Billing", href: billingHref },
        { icon: "⚙", label: "Settings", href: settingsHref },
      ],
    },
  ];
}
