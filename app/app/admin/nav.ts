import type { NavGroup } from "@/components/dashboard/DashboardShell";

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { icon: "◆", label: "Overview", href: "/admin" },
      { icon: "🏢", label: "Agencies", href: "/admin/agencies" },
      { icon: "👥", label: "Users", href: "/admin/users" },
      { icon: "📜", label: "Activity", href: "/admin/activity" },
    ],
  },
  {
    /*
     * Everything that shapes what the builder can produce, as opposed to who
     * uses the platform. Section library moved out of "Platform" because it is
     * a builder capability, not an account concern — and this group is where
     * the remaining builder-configuration work lands.
     *
     * The two `soon` entries render greyed and unclickable: they are specified
     * but unbuilt, and shipping them as working links would repeat the dead-nav
     * problem already cleaned out of the agency sidebar.
     */
    label: "Builder",
    items: [
      { icon: "🎨", label: "Section library", href: "/admin/sections" },
      { icon: "🎛", label: "Global design", href: "/admin/design", soon: true },
      { icon: "🔌", label: "Plugin checklist", href: "/admin/plugins", soon: true },
    ],
  },
  {
    label: "System",
    items: [
      { icon: "🤖", label: "AI providers", href: "/admin/ai-providers" },
      { icon: "💳", label: "Billing & plans", href: "/admin/billing" },
      { icon: "📊", label: "Usage & cost", href: "/admin" },
      { icon: "⚙", label: "Settings", href: "/admin/settings" },
      { icon: "✉", label: "SMTP", href: "/admin/settings/smtp" },
    ],
  },
];
