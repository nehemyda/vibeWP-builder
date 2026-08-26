import type { NavGroup } from "@/components/dashboard/DashboardShell";

export function agencyNav(agencyName: string, partnerId: string | null): NavGroup[] {
  const base = partnerId ? `/agency/${partnerId}` : "/agency";
  const sitesHref = partnerId ? `${base}/sites` : "/agency";
  const teamHref = partnerId ? `${base}/team` : "/agency";
  const billingHref = partnerId ? `${base}/billing` : "/agency";
  const settingsHref = partnerId ? `${base}/settings` : "/agency";
  return [
    {
      label: agencyName,
      items: [
        { icon: "◆", label: "Overview", href: base },
        { icon: "🗂", label: "All client sites", href: sitesHref },
        { icon: "👥", label: "Team", href: teamHref },
        { icon: "💳", label: "Billing", href: billingHref },
      ],
    },
    {
      label: "Account",
      items: [{ icon: "⚙", label: "Settings", href: settingsHref }],
    },
  ];
}
