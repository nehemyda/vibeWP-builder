"use server";

import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";

async function requireAgencyContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  if (profile?.role !== "agency_owner" && profile?.role !== "agency_member") {
    redirect("/dashboard");
  }

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

  if (!agency) redirect("/agency");

  const basePath = `/agency/${agency.partnerId}`;
  return { user, profile, agency, teamPath: `${basePath}/team`, settingsPath: `${basePath}/settings` };
}

/** Bound to <form action={inviteTeamMemberAction}> on the agency team page — a real form action. */
export async function inviteTeamMemberAction(formData: FormData) {
  const { profile: actor, agency, teamPath } = await requireAgencyContext();

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
    .values({ id: data.user.id, fullName, role: "agency_member" })
    .onConflictDoNothing();
  await db
    .insert(agencyMembers)
    .values({ agencyId: agency.id, userId: data.user.id, role: "member" });
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "team.invited",
    targetType: "team_member",
    targetId: data.user.id,
    targetLabel: fullName,
  });

  redirect(teamPath);
}

/** Bound to <form action={updateAgencyNameAction}> on the agency settings page. */
export async function updateAgencyNameAction(formData: FormData) {
  const { agency, settingsPath } = await requireAgencyContext();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(settingsPath);

  await db.update(agencies).set({ name }).where(eq(agencies.id, agency.id));
  redirect(`${settingsPath}?saved=1`);
}

/** Bound to <form action={updateTeamMemberRoleAction}> per row on the agency team page. Owner-only. */
export async function updateTeamMemberRoleAction(formData: FormData) {
  const { profile: actor, agency, teamPath } = await requireAgencyContext();
  if (actor.role !== "agency_owner") redirect(teamPath);

  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "member");
  if (!memberId) redirect(teamPath);

  const membership = await db.query.agencyMembers.findFirst({ where: eq(agencyMembers.id, memberId) });
  if (!membership || membership.agencyId !== agency.id) redirect(teamPath);

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, membership.userId) });
  await db.update(agencyMembers).set({ role }).where(eq(agencyMembers.id, memberId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "team.role_updated",
    targetType: "team_member",
    targetId: membership.userId,
    targetLabel: target?.fullName ?? null,
    metadata: { role },
  });

  redirect(`${teamPath}?saved=1`);
}

/**
 * Bound via suspendTeamMemberAction.bind(null, userId) on the agency team page.
 * Bans the Supabase login and marks the profile inactive — same mechanism
 * as the admin-side deactivateUserAction, but scoped: only lets an agency
 * owner suspend a member of their own agency.
 */
export async function suspendTeamMemberAction(userId: string) {
  const { profile: actor, agency, teamPath } = await requireAgencyContext();
  if (actor.role !== "agency_owner") redirect(teamPath);

  const membership = await db.query.agencyMembers.findFirst({
    where: and(eq(agencyMembers.userId, userId), eq(agencyMembers.agencyId, agency.id)),
  });
  if (!membership) redirect(teamPath);

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  await db.update(profiles).set({ active: false }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "team.suspended",
    targetType: "team_member",
    targetId: userId,
    targetLabel: target?.fullName ?? null,
  });

  redirect(teamPath);
}

export async function reactivateTeamMemberAction(userId: string) {
  const { profile: actor, agency, teamPath } = await requireAgencyContext();
  if (actor.role !== "agency_owner") redirect(teamPath);

  const membership = await db.query.agencyMembers.findFirst({
    where: and(eq(agencyMembers.userId, userId), eq(agencyMembers.agencyId, agency.id)),
  });
  if (!membership) redirect(teamPath);

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  await db.update(profiles).set({ active: true }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "team.reactivated",
    targetType: "team_member",
    targetId: userId,
    targetLabel: target?.fullName ?? null,
  });

  redirect(teamPath);
}
