import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers, sites, siteMembers } from "@/lib/db/schema";
import { resolveSitePaths } from "@/lib/site-paths";
import { planLabel } from "@/lib/billing";
import { DashboardShell, type NavGroup } from "@/components/dashboard/DashboardShell";
import { CopyableText } from "@/components/dashboard/CopyableText";
import { updateOwnProfileAction } from "@/app/actions/profile";
import { ChangePasswordForm } from "./ChangePasswordForm";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../admin/nav";
import { agencyNav } from "../agency/nav";
import { smbNav } from "../dashboard/nav";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  agency_owner: "Agency owner",
  agency_member: "Agency member",
  smb_owner: "Site owner",
  smb_member: "Site team member",
};

const AGENCY_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
  deleted: "Deleted",
};

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <div className={shell.fieldLabel}>{label}</div>
      <div style={{ marginTop: "0.2rem" }}>{value}</div>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  if (!profile) redirect("/login");
  const { saved } = await searchParams;

  let navGroups: NavGroup[];
  let userRole = ROLE_LABEL[profile.role] ?? profile.role;
  let accountDetails: ReactNode;

  if (profile.role === "super_admin") {
    navGroups = ADMIN_NAV;
    accountDetails = (
      <>
        <DetailRow label="Access" value="Full platform access — every agency, site, and setting." />
      </>
    );
  } else if (profile.role === "agency_owner" || profile.role === "agency_member") {
    const agency =
      profile.role === "agency_owner"
        ? await db.query.agencies.findFirst({ where: eq(agencies.ownerUserId, user.id) })
        : await (async () => {
            const membership = await db.query.agencyMembers.findFirst({
              where: eq(agencyMembers.userId, user.id),
            });
            return membership
              ? db.query.agencies.findFirst({ where: eq(agencies.id, membership.agencyId) })
              : undefined;
          })();
    navGroups = agencyNav(agency?.name ?? "Your agency", agency?.partnerId ?? null);
    accountDetails = agency ? (
      <>
        <DetailRow
          label="Partner ID"
          value={
            <CopyableText value={agency.partnerId ?? ""}>
              <span className={shell.idBadge}>{agency.partnerId ?? "—"}</span>
            </CopyableText>
          }
        />
        <DetailRow label="Agency" value={<CopyableText value={agency.name}>{agency.name}</CopyableText>} />
        <DetailRow label="Plan" value={planLabel(agency.plan)} />
        <DetailRow label="Status" value={AGENCY_STATUS_LABEL[agency.status] ?? agency.status} />
        <DetailRow label="Agency joined" value={agency.createdAt.toLocaleDateString()} />
      </>
    ) : (
      <DetailRow label="Agency" value="Not linked to an agency yet." />
    );
  } else {
    const site =
      profile.role === "smb_owner"
        ? await db.query.sites.findFirst({
            where: and(eq(sites.ownerUserId, user.id), isNull(sites.deletedAt)),
            orderBy: (s, { desc }) => [desc(s.createdAt)],
          })
        : await (async () => {
            const membership = await db.query.siteMembers.findFirst({
              where: eq(siteMembers.userId, user.id),
            });
            if (!membership) return undefined;
            return db.query.sites.findFirst({
              where: and(eq(sites.id, membership.siteId), isNull(sites.deletedAt)),
            });
          })();
    navGroups = smbNav(site ? await resolveSitePaths(site) : null);
    if (site) userRole = site.name;
    accountDetails = site ? (
      <>
        <DetailRow
          label="SMB ID"
          value={
            <CopyableText value={site.smbId ?? ""}>
              <span className={shell.idBadge}>{site.smbId ?? "—"}</span>
            </CopyableText>
          }
        />
        <DetailRow label="Site" value={<CopyableText value={site.name}>{site.name}</CopyableText>} />
        <DetailRow label="Domain" value={site.domain ?? "not yet published"} />
        <DetailRow label="Plan" value={planLabel(site.plan)} />
        <DetailRow label="Status" value={site.status === "live" ? "Live" : site.status === "trial" ? "Trial" : "Draft"} />
        <DetailRow label="Site created" value={site.createdAt.toLocaleDateString()} />
      </>
    ) : (
      <DetailRow label="Site" value="You don't have a site yet." />
    );
  }

  return (
    <DashboardShell
      navGroups={navGroups}
      activeHref="/profile"
      userName={profile.fullName}
      userRole={userRole}
      title="Profile"
      subtitle={ROLE_LABEL[profile.role] ?? profile.role}
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div className={shell.twoCol} style={{ marginBottom: "1.2rem" }}>
        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1.2rem", fontSize: "1rem" }}>Your info</h2>
          <form
            action={updateOwnProfileAction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Full name
              </label>
              <input name="fullName" defaultValue={profile.fullName} required style={inputStyle} />
            </div>
            <DetailRow label="Email" value={<span className={shell.rowSub}>{user.email}</span>} />
            <DetailRow label="Role" value={ROLE_LABEL[profile.role] ?? profile.role} />
            <DetailRow label="Account status" value={profile.active ? "Active" : "Deactivated"} />
            <DetailRow label="Joined" value={profile.createdAt.toLocaleDateString()} />
            <DetailRow
              label="User ID"
              value={
                <CopyableText value={profile.id}>
                  <span className={shell.idBadge}>{profile.id}</span>
                </CopyableText>
              }
            />
            <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ alignSelf: "flex-start" }}>
              Save
            </button>
          </form>
        </div>

        <div className={shell.panel} style={{ padding: "1.4rem" }}>
          <h2 style={{ margin: "0 0 1.2rem", fontSize: "1rem" }}>Account details</h2>
          {accountDetails}
        </div>
      </div>

      <div className={shell.panel} style={{ padding: "1.4rem", maxWidth: 480 }}>
        <h2 style={{ margin: "0 0 1.2rem", fontSize: "1rem" }}>Change password</h2>
        <ChangePasswordForm />
      </div>
    </DashboardShell>
  );
}
