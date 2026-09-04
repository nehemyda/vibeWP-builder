import { requireRole } from "@/lib/auth/require-role";
import { getSmtpSettings } from "@/lib/smtp-settings";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { updateSmtpSettingsAction, sendTestEmailAction } from "@/app/actions/smtp";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../../nav";

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

export default async function AdminSmtpSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; testSent?: string; error?: string }>;
}) {
  const { profile, user } = await requireRole(["super_admin"]);
  const { saved, testSent, error } = await searchParams;
  const settings = await getSmtpSettings();
  const isConfigured = !!(settings.host && settings.username && settings.password && settings.fromEmail);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/settings/smtp"
      userName={profile.fullName}
      userRole="Super admin"
      title="SMTP"
      subtitle="Outbound email server for platform-sent mail"
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}
      {testSent && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Test email sent.
        </div>
      )}
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className={shell.twoCol}>
        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Server settings</h2>
          <form suppressHydrationWarning action={updateSmtpSettingsAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Host</label>
              <input name="host" defaultValue={settings.host ?? ""} placeholder="smtp.sendgrid.net" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
              <div>
                <label style={labelStyle}>Port</label>
                <input name="port" type="number" defaultValue={settings.port} style={inputStyle} />
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.6rem" }}>
                  <input type="checkbox" name="secure" defaultChecked={settings.secure} />
                  Use TLS (secure)
                </label>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Username</label>
              <input name="username" defaultValue={settings.username ?? ""} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input
                name="password"
                type="password"
                placeholder={settings.password ? "•••••••• (unchanged)" : "not set"}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>From email</label>
              <input
                name="fromEmail"
                type="email"
                defaultValue={settings.fromEmail ?? ""}
                placeholder="noreply@yourdomain.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>From name</label>
              <input name="fromName" defaultValue={settings.fromName} style={inputStyle} />
            </div>
            <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
              Save
            </button>
          </form>
        </div>

        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Status</h2>
          <div className={`${shell.pill} ${isConfigured ? shell.pillLive : shell.pillDraft}`} style={{ marginBottom: "1rem" }}>
            {isConfigured ? "Configured" : "Not configured"}
          </div>
          <p className={shell.rowSub} style={{ marginBottom: "1rem" }}>
            This SMTP server is used for platform-sent mail (e.g. test emails below). Team invites and password
            resets still go through Supabase Auth&apos;s own configured email provider, set separately in your
            Supabase project.
          </p>

          <h2 style={{ margin: "1.4rem 0 1rem", fontSize: "1rem" }}>Send a test email</h2>
          <form action={sendTestEmailAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Send to</label>
              <input name="to" type="email" defaultValue={user.email ?? ""} required style={inputStyle} />
            </div>
            <button type="submit" className={shell.btn} style={{ alignSelf: "flex-start" }} disabled={!isConfigured}>
              Send test email
            </button>
            {!isConfigured && (
              <p className={shell.rowSub} style={{ margin: 0 }}>
                Fill in host, username, password, and from email first.
              </p>
            )}
          </form>
        </div>
      </div>
    </DashboardShell>
  );
}
