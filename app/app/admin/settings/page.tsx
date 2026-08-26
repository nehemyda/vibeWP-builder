import { requireRole } from "@/lib/auth/require-role";
import { getPlatformSettings } from "@/lib/platform-settings";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { updatePlatformSettingsAction } from "@/app/actions/settings";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

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

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved } = await searchParams;
  const settings = await getPlatformSettings();

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/settings"
      userName={profile.fullName}
      userRole="Super admin"
      title="Settings"
      subtitle="Platform-wide configuration"
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 480, padding: "1.4rem" }}>
        <form
          action={updatePlatformSettingsAction}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label htmlFor="platformName" style={labelStyle}>
              Platform name
            </label>
            <input
              id="platformName"
              name="platformName"
              defaultValue={settings.platformName}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="supportEmail" style={labelStyle}>
              Support email
            </label>
            <input
              id="supportEmail"
              name="supportEmail"
              type="email"
              defaultValue={settings.supportEmail ?? ""}
              placeholder="support@vibewp.dev"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="defaultTimezone" style={labelStyle}>
              Default timezone
            </label>
            <input
              id="defaultTimezone"
              name="defaultTimezone"
              defaultValue={settings.defaultTimezone}
              style={inputStyle}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            <input type="checkbox" name="maintenanceMode" defaultChecked={settings.maintenanceMode} />
            Maintenance mode (illustrative — not enforced yet)
          </label>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
            Save
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
