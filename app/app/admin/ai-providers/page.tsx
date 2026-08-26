import { requireRole } from "@/lib/auth/require-role";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";
import { updateAiProviderSettingsAction } from "@/app/actions/ai-provider";

function maskKey(key: string | null): string | null {
  if (!key) return null;
  return `${"•".repeat(8)}${key.slice(-4)}`;
}

const fieldLabelStyle = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
} as const;

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
  fontFamily: "inherit",
} as const;

export default async function AiProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved } = await searchParams;
  const settings = await getAiProviderSettings();

  const providers = [
    {
      key: "gemini",
      label: "Gemini",
      existing: settings.geminiApiKey,
      wired: true,
    },
    {
      key: "openai",
      label: "OpenAI",
      existing: settings.openaiApiKey,
      wired: false,
    },
    {
      key: "claude",
      label: "Claude",
      existing: settings.claudeApiKey,
      wired: false,
    },
  ] as const;

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/ai-providers"
      userName={profile.fullName}
      userRole="Super admin"
      title="AI providers"
      subtitle="Choose which provider powers the builder's homepage generation"
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 520, padding: "1.4rem" }}>
        <form
          action={updateAiProviderSettingsAction}
          style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}
        >
          <div>
            <label htmlFor="activeProvider" style={fieldLabelStyle}>
              Active provider
            </label>
            <select
              id="activeProvider"
              name="activeProvider"
              defaultValue={settings.activeProvider}
              style={inputStyle}
            >
              <option value="mock">Keyword mock (no AI, default)</option>
              <option value="gemini">Gemini</option>
              <option value="openai" disabled={!settings.openaiApiKey}>
                OpenAI {!settings.openaiApiKey && "(add a key first)"}
              </option>
              <option value="claude" disabled={!settings.claudeApiKey}>
                Claude {!settings.claudeApiKey && "(add a key first)"}
              </option>
            </select>
            <p className={shell.rowSub} style={{ marginTop: "0.4rem" }}>
              &quot;Keyword mock&quot; is the deterministic fallback — no API calls, no cost.
              It&apos;s also the automatic fallback if the active provider&apos;s call fails.
            </p>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: "1.2rem" }}>
            {providers.map((p) => (
              <div key={p.key} style={{ marginBottom: "1.1rem" }}>
                <label htmlFor={`${p.key}ApiKey`} style={fieldLabelStyle}>
                  {p.label} API key {!p.wired && <span className={shell.rowSub}>(stored, not wired to generation yet)</span>}
                </label>
                <input
                  id={`${p.key}ApiKey`}
                  name={`${p.key}ApiKey`}
                  type="password"
                  placeholder={
                    maskKey(p.existing) ? `${maskKey(p.existing)} — leave blank to keep` : `Paste your ${p.label} API key`
                  }
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>

          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Save
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
