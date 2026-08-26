import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteMembers, profiles as profilesTable, type sites, type profiles } from "@/lib/db/schema";
import type { resolveSitePaths } from "@/lib/site-paths";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { smbNav } from "../nav";
import {
  inviteSiteMemberAction,
  suspendSiteMemberAction,
  reactivateSiteMemberAction,
} from "@/app/actions/site-team";

type Profile = typeof profiles.$inferSelect;
type Site = typeof sites.$inferSelect;
type Role = Profile["role"];
type Paths = Awaited<ReturnType<typeof resolveSitePaths>>;

export async function TeamView({
  profile,
  role,
  site,
  paths,
  error,
}: {
  profile: Profile;
  role: Role;
  site: Site | undefined;
  paths: Paths | null;
  error?: string;
}) {
  if (!site || !paths) {
    return (
      <DashboardShell
        navGroups={smbNav(null)}
        activeHref="/dashboard"
        userName={profile.fullName}
        userRole={role === "smb_owner" ? "Site owner" : "Team member"}
        title="Team"
        subtitle="You don't have a site yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Start building your site from the landing page first.
        </div>
      </DashboardShell>
    );
  }

  const isOwner = role === "smb_owner";

  const owner = await db.query.profiles.findFirst({ where: eq(profilesTable.id, site.ownerUserId) });
  const members = await db
    .select({
      memberId: siteMembers.id,
      userId: profilesTable.id,
      fullName: profilesTable.fullName,
      active: profilesTable.active,
    })
    .from(siteMembers)
    .innerJoin(profilesTable, eq(profilesTable.id, siteMembers.userId))
    .where(eq(siteMembers.siteId, site.id));

  return (
    <DashboardShell
      navGroups={smbNav(paths)}
      activeHref={paths.teamPath}
      userName={profile.fullName}
      userRole={isOwner ? "Site owner" : "Team member"}
      title="Team"
      subtitle={`${members.length + 1} member${members.length === 0 ? "" : "s"} on ${site.name}`}
    >
      {error && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "#b3261e" }}>
          {error}
        </div>
      )}

      <div className={shell.panel} style={{ padding: "1.3rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.9rem", fontSize: "1rem" }}>Roles &amp; permissions</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div>
            <div className={shell.rowName} style={{ marginBottom: "0.3rem" }}>Owner</div>
            <p className={shell.rowSub} style={{ margin: 0 }}>
              Full control — edit the site, invite and manage the team. There is exactly one owner per
              site.
            </p>
          </div>
          <div>
            <div className={shell.rowName} style={{ marginBottom: "0.3rem" }}>Member</div>
            <p className={shell.rowSub} style={{ margin: 0 }}>
              Can view the dashboard and leads. Can&apos;t edit the site or manage the team.
            </p>
          </div>
        </div>
        {!isOwner && (
          <p className={shell.rowSub} style={{ marginTop: "1rem" }}>
            Only the site owner can invite or suspend team members.
          </p>
        )}
      </div>

      <div className={shell.panel} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={shell.rowName}>{owner?.fullName ?? "—"}</td>
                <td>Owner</td>
                <td>
                  <span className={`${shell.pill} ${shell.pillLive}`}>Active</span>
                </td>
                {isOwner && <td></td>}
              </tr>
              {members.map((m) => (
                <tr key={m.memberId}>
                  <td className={shell.rowName}>{m.fullName}</td>
                  <td>Member</td>
                  <td>
                    <span className={`${shell.pill} ${m.active ? shell.pillLive : shell.pillDraft}`}>
                      {m.active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  {isOwner && (
                    <td>
                      {m.active ? (
                        <form action={suspendSiteMemberAction.bind(null, m.userId)}>
                          <ConfirmSubmitButton
                            confirmMessage={`Suspend ${m.fullName}? They won't be able to log in until reactivated.`}
                            className={`${shell.btn} ${shell.btnSmall}`}
                          >
                            Suspend
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <form action={reactivateSiteMemberAction.bind(null, m.userId)}>
                          <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                            Reactivate
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isOwner && (
        <div className={shell.panel} style={{ maxWidth: 420, padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Invite a team member</h2>
          <form
            action={inviteSiteMemberAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label
                htmlFor="fullName"
                style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
              >
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                required
                placeholder="Jordan Lee"
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
                htmlFor="email"
                style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="jordan@example.com"
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
              Send invite
            </button>
            <p className={shell.rowSub}>
              Sends a real invite email via Supabase and adds them to the team immediately.
            </p>
          </form>
        </div>
      )}
    </DashboardShell>
  );
}
