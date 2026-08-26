"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";

/** Bound to <form action={createUserAction}> on /admin/users/new. Invites by email — no password to set. */
export async function createUserAction(formData: FormData) {
  const { profile: actor } = await requirePermission("users.manage");

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "smb_owner") as "smb_owner" | "super_admin";
  if (!fullName || !email) redirect("/admin/users/new");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    redirect(`/admin/users/new?error=${encodeURIComponent(error?.message ?? "Could not invite user.")}`);
  }

  await db.insert(profiles).values({ id: data.user.id, fullName, role }).onConflictDoNothing();
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "user.created",
    targetType: "user",
    targetId: data.user.id,
    targetLabel: fullName,
  });

  redirect("/admin/users");
}

/** Bound to <form action={updateUserAction}> on /admin/users/[userId]/edit. */
export async function updateUserAction(formData: FormData) {
  const { profile: actor } = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "") as
    | "super_admin"
    | "agency_owner"
    | "agency_member"
    | "smb_owner";
  if (!userId || !fullName) redirect("/admin/users");

  await db.update(profiles).set({ fullName, role }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "user.edited",
    targetType: "user",
    targetId: userId,
    targetLabel: fullName,
  });

  redirect("/admin/users");
}

/**
 * Bound via deactivateUserAction.bind(null, userId) in a form. Bans the
 * Supabase login (can't sign in) and marks the profile inactive, but leaves
 * the account itself intact and reversible via reactivateUserAction.
 */
export async function deactivateUserAction(userId: string) {
  const { profile: actor } = await requirePermission("users.manage");

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  await db.update(profiles).set({ active: false }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "user.deactivated",
    targetType: "user",
    targetId: userId,
    targetLabel: target?.fullName ?? null,
  });

  redirect("/admin/users");
}

export async function reactivateUserAction(userId: string) {
  const { profile: actor } = await requirePermission("users.manage");

  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  await db.update(profiles).set({ active: true }).where(eq(profiles.id, userId));
  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "user.reactivated",
    targetType: "user",
    targetId: userId,
    targetLabel: target?.fullName ?? null,
  });

  redirect("/admin/users");
}
