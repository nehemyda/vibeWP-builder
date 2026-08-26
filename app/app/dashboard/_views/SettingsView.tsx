import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfiles, type sites, type profiles } from "@/lib/db/schema";
import type { resolveSitePaths } from "@/lib/site-paths";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { BusinessDetailsFields } from "@/components/dashboard/BusinessDetailsFields";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { smbNav } from "../nav";
import { updateSiteSettingsAction } from "@/app/actions/sites";
import { upsertBusinessProfileAction } from "@/app/actions/business-profile";

type Profile = typeof profiles.$inferSelect;
type Site = typeof sites.$inferSelect;
type Role = Profile["role"];
type Paths = Awaited<ReturnType<typeof resolveSitePaths>>;

export async function SettingsView({
  profile,
  role,
  site,
  paths,
  saved,
}: {
  profile: Profile;
  role: Role;
  site: Site | undefined;
  paths: Paths | null;
  saved?: string;
}) {
  if (!site || !paths) {
    return (
      <DashboardShell
        navGroups={smbNav(null)}
        activeHref="/dashboard"
        userName={profile.fullName}
        userRole={role === "smb_owner" ? "Site owner" : "Team member"}
        title="Settings"
        subtitle="You don't have a site yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Start building your site from the landing page first.
        </div>
      </DashboardShell>
    );
  }

  const businessProfile = await db.query.businessProfiles.findFirst({
    where: and(eq(businessProfiles.ownerType, "site"), eq(businessProfiles.ownerId, site.id)),
  });

  return (
    <DashboardShell
      navGroups={smbNav(paths)}
      activeHref={paths.settingsPath}
      userName={profile.fullName}
      userRole={site.name}
      title="Settings"
      subtitle={site.name}
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.panel} style={{ maxWidth: 420, padding: "1.4rem" }}>
        <form
          action={updateSiteSettingsAction}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <input type="hidden" name="siteId" value={site.id} />
          <input type="hidden" name="redirectTo" value={paths.settingsPath} />
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              SMB ID
            </div>
            <CopyableText value={site.smbId ?? ""}>
              <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
            </CopyableText>
          </div>

          <div>
            <label
              htmlFor="name"
              style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
            >
              Site name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={site.name}
              required
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.9rem",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="domain"
              style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
            >
              Domain
            </label>
            <input
              id="domain"
              name="domain"
              defaultValue={site.domain ?? ""}
              placeholder="yourbusiness.com"
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                borderRadius: 10,
                border: "1px solid var(--line)",
                fontSize: "0.9rem",
              }}
            />
          </div>
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
            Save
          </button>
        </form>
      </div>

      <div className={shell.panel} style={{ maxWidth: 720, padding: "1.4rem", marginTop: "1.2rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Business details</h2>
        <form action={upsertBusinessProfileAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input type="hidden" name="ownerType" value="site" />
          <input type="hidden" name="ownerId" value={site.id} />
          <input type="hidden" name="redirectTo" value={paths.settingsPath} />
          <BusinessDetailsFields profile={businessProfile ?? null} />
          <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
            Save business details
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
