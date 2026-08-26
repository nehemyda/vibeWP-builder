import type { NavGroup } from "@/components/dashboard/DashboardShell";

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { icon: "◆", label: "Overview", href: "/admin" },
      { icon: "🏢", label: "Agencies", href: "/admin/agencies" },
      { icon: "👥", label: "Users", href: "/admin/users" },
      { icon: "📜", label: "Activity", href: "/admin/activity" },
      { icon: "🎨", label: "Section library", href: "/admin/sections" },
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
