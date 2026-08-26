"use server";

import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";
import { profiles, sites, siteMembers } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { resolveSitePaths } from "@/lib/site-paths";

async function requireSiteTeamContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  if (profile?.role !== "smb_owner") redirect("/dashboard");

  const site = await db.query.sites.findFirst({
    where: and(eq(sites.ownerUserId, user.id), isNull(sites.deletedAt)),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  if (!site) redirect("/dashboard");

  const { teamPath } = await resolveSitePaths(site);

  return { user, profile, site, teamPath };
}

/** Bound to <form action={inviteSiteMemberAction}> on the SMB team page — owner-only. */
export async function inviteSiteMemberAction(formData: FormData) {
  const { profile: actor, site, teamPath } = await requireSiteTeamContext();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!email || !fullName) redirect(teamPath);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    redirect(`${teamPath}?error=${encodeURIComponent(error.message)}`);
  }

  await db
    .insert(profiles)
    .values({ id: data.user.id, fullName, role: "smb_member" })
    .onConflictDoNothing();
  await db.insert(siteMembers).values({ siteId: site.id, userId: data.user.id, role: "member" });
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "site_team.invited",
    targetType: "site_team_member",
    targetId: data.user.id,
    targetLabel: fullName,
  });

  redirect(teamPath);
}

/**
 * Bound via suspendSiteMemberAction.bind(null, userId) on the SMB team page.
 * Bans the Supabase login and marks the profile inactive — owner-only, and
 * only for a member of their own site.
 */
export async function suspendSiteMemberAction(userId: string) {
  const { profile: actor, site, teamPath } = await requireSiteTeamContext();

  const membership = await db.query.siteMembers.findFirst({
    where: and(eq(siteMembers.userId, userId), eq(siteMembers.siteId, site.id)),
  });
  if (!membership) redirect(teamPath);

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  await db.update(profiles).set({ active: false }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "site_team.suspended",
    targetType: "site_team_member",
    targetId: userId,
    targetLabel: target?.fullName ?? null,
  });

  redirect(teamPath);
}

export async function reactivateSiteMemberAction(userId: string) {
  const { profile: actor, site, teamPath } = await requireSiteTeamContext();

  const membership = await db.query.siteMembers.findFirst({
    where: and(eq(siteMembers.userId, userId), eq(siteMembers.siteId, site.id)),
  });
  if (!membership) redirect(teamPath);

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  await db.update(profiles).set({ active: true }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "site_team.reactivated",
    targetType: "site_team_member",
    targetId: userId,
    targetLabel: target?.fullName ?? null,
  });

  redirect(teamPath);
}
