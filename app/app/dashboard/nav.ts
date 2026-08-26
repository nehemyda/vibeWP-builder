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
        { icon: "✏", label: "Edit site", href: editHref },
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
