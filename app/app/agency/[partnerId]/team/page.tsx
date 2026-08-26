import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencyMembers, profiles } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { agencyNav } from "../../nav";
import {
  inviteTeamMemberAction,
  updateTeamMemberRoleAction,
  suspendTeamMemberAction,
  reactivateTeamMemberAction,
} from "@/app/actions/agency";

export default async function AgencyTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { partnerId } = await params;
  const { profile, agency } = await requireAgency();
  const { error } = await searchParams;

  if (!agency) {
    return (
      <DashboardShell
        navGroups={agencyNav("Your agency", null)}
        activeHref="/agency"
        userName={profile.fullName}
        userRole="Agency owner"
        title="Team"
        subtitle="This account isn't linked to an agency yet."
      >
        <div className={shell.panel} style={{ padding: "1.3rem" }}>
          Ask a super admin to link your account to an agency first.
        </div>
      </DashboardShell>
    );
  }

  const basePath = `/agency/${agency.partnerId}`;
  if (agency.partnerId !== partnerId) {
    redirect(`${basePath}/team`);
  }

  const owner = await db.query.profiles.findFirst({ where: eq(profiles.id, agency.ownerUserId) });
  const members = await db
    .select({
      memberId: agencyMembers.id,
      userId: profiles.id,
      fullName: profiles.fullName,
      role: agencyMembers.role,
      active: profiles.active,
    })
    .from(agencyMembers)
    .innerJoin(profiles, eq(profiles.id, agencyMembers.userId))
    .where(eq(agencyMembers.agencyId, agency.id));
  const isOwner = profile.id === agency.ownerUserId;

  return (
    <DashboardShell
      navGroups={agencyNav(agency.name, agency.partnerId)}
      activeHref={`${basePath}/team`}
      userName={profile.fullName}
      userRole="Agency owner"
      title="Team"
      subtitle={`${members.length + 1} member${members.length === 0 ? "" : "s"} on ${agency.name}`}
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
              Full control — edit agency info, business details, plan, and manage every team member. There is
              exactly one owner per agency, set by a super admin.
            </p>
          </div>
          <div>
            <div className={shell.rowName} style={{ marginBottom: "0.3rem" }}>Admin</div>
            <p className={shell.rowSub} style={{ margin: 0 }}>
              Manages client sites and can invite new team members, but can&apos;t edit agency settings or
              suspend teammates.
            </p>
          </div>
          <div>
            <div className={shell.rowName} style={{ marginBottom: "0.3rem" }}>Member</div>
            <p className={shell.rowSub} style={{ margin: 0 }}>
              Can view and work on client sites. Everything else is read-only.
            </p>
          </div>
        </div>
        {!isOwner && (
          <p className={shell.rowSub} style={{ marginTop: "1rem" }}>
            Only the agency owner can edit roles or suspend team members.
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
                  <td>
                    {isOwner ? (
                      <form
                        action={updateTeamMemberRoleAction}
                        style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}
                      >
                        <input type="hidden" name="memberId" value={m.memberId} />
                        <select
                          name="role"
                          defaultValue={m.role}
                          style={{
                            padding: "0.35rem 0.6rem",
                            borderRadius: 8,
                            border: "1px solid var(--line)",
                            fontSize: "0.82rem",
                          }}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                        <button type="submit" className={`${shell.btn} ${shell.btnSmall}`}>
                          Save
                        </button>
                      </form>
                    ) : (
                      m.role
                    )}
                  </td>
                  <td>
                    <span className={`${shell.pill} ${m.active ? shell.pillLive : shell.pillDraft}`}>
                      {m.active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  {isOwner && (
                    <td>
                      {m.active ? (
                        <form action={suspendTeamMemberAction.bind(null, m.userId)}>
                          <ConfirmSubmitButton
                            confirmMessage={`Suspend ${m.fullName}? They won't be able to log in until reactivated.`}
                            className={`${shell.btn} ${shell.btnSmall}`}
                          >
                            Suspend
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <form action={reactivateTeamMemberAction.bind(null, m.userId)}>
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

      <div className={shell.panel} style={{ maxWidth: 420, padding: "1.4rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Invite a team member</h2>
        <form
          action={inviteTeamMemberAction}
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
              placeholder="jordan@agency.com"
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
    </DashboardShell>
  );
}
