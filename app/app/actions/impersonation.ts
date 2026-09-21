"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers, sites, siteMembers } from "@/lib/db/schema";
import { roleHomePath } from "@/lib/role-redirect";
import { resolveSitePaths } from "@/lib/site-paths";
import { IMPERSONATION_COOKIE, backupToKeep, readImpersonationSession } from "@/lib/impersonation";
import { logActivity } from "@/lib/activity";

/** Where impersonation should land — the ID-ful canonical URL, not the bare one, so the admin sees at a glance who they're viewing. */
async function impersonationHomePath(targetUserId: string, role: string): Promise<string> {
  if (role === "agency_owner") {
    const agency = await db.query.agencies.findFirst({ where: eq(agencies.ownerUserId, targetUserId) });
    if (agency?.partnerId) return `/agency/${agency.partnerId}`;
    return "/agency";
  }
  if (role === "agency_member") {
    const membership = await db.query.agencyMembers.findFirst({ where: eq(agencyMembers.userId, targetUserId) });
    const agency = membership
      ? await db.query.agencies.findFirst({ where: eq(agencies.id, membership.agencyId) })
      : undefined;
    if (agency?.partnerId) return `/agency/${agency.partnerId}`;
    return "/agency";
  }
  if (role === "smb_owner") {
    const site = await db.query.sites.findFirst({ where: eq(sites.ownerUserId, targetUserId) });
    if (site?.smbId) return (await resolveSitePaths(site)).dashboardPath;
    return "/dashboard";
  }
  if (role === "smb_member") {
    const membership = await db.query.siteMembers.findFirst({ where: eq(siteMembers.userId, targetUserId) });
    const site = membership
      ? await db.query.sites.findFirst({ where: eq(sites.id, membership.siteId) })
      : undefined;
    if (site?.smbId) return (await resolveSitePaths(site)).dashboardPath;
    return "/dashboard";
  }
  return roleHomePath(role as Parameters<typeof roleHomePath>[0]);
}

async function canImpersonate(
  callerId: string,
  callerRole: string,
  targetUserId: string,
): Promise<boolean> {
  if (callerRole === "super_admin") return true;

  if (callerRole === "agency_owner") {
    const agency = await db.query.agencies.findFirst({
      where: eq(agencies.ownerUserId, callerId),
    });
    if (!agency) return false;
    const targetSite = await db.query.sites.findFirst({
      where: eq(sites.ownerUserId, targetUserId),
    });
    return targetSite?.agencyId === agency.id;
  }

  return false;
}

/**
 * Bound via startImpersonationAction.bind(null, targetUserId) in a <form
 * action={...}>. Switches the live Supabase session to the target user,
 * after backing up the caller's own session tokens in a cookie so
 * stopImpersonationAction() can restore them later.
 */
export async function startImpersonationAction(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) redirect("/login");

  const callerProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, caller.id),
  });
  if (!callerProfile) redirect("/login");

  if (!(await canImpersonate(caller.id, callerProfile.role, targetUserId))) {
    redirect(roleHomePath(callerProfile.role));
  }

  const {
    data: { session: callerSession },
  } = await supabase.auth.getSession();
  if (!callerSession) redirect("/login");

  const admin = createAdminClient();
  const { data: targetAuthUser, error: getUserError } =
    await admin.auth.admin.getUserById(targetUserId);
  if (getUserError || !targetAuthUser.user?.email) {
    redirect(roleHomePath(callerProfile.role));
  }

  // generateLink does NOT send an email — it just mints a token we verify
  // server-side immediately below, so the target user is never notified.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetAuthUser.user.email,
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    redirect(roleHomePath(callerProfile.role));
  }

  const { data: verifyData, error: verifyError } = await admin.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });
  if (verifyError || !verifyData.session) {
    redirect(roleHomePath(callerProfile.role));
  }

  const targetProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, targetUserId),
  });

  /*
   * A hop from inside an impersonation. The caller here is the person being
   * impersonated — an agency owner opening a client — so the real operator,
   * and the session to return to, is whoever the existing cookie names.
   * See backupToKeep() in lib/impersonation.ts.
   */
  const existing = await readImpersonationSession();
  const operator = existing
    ? { id: existing.impersonatorId ?? caller.id, name: existing.impersonatorName ?? callerProfile.fullName ?? "Unknown" }
    : { id: caller.id, name: callerProfile.fullName ?? "Unknown" };

  /*
   * Log BEFORE swapping the session, and pass the impersonator explicitly.
   *
   * Both details matter. After setSession() below, auth.getUser() resolves to
   * the target user and the caller's identity is unrecoverable server-side —
   * so this row could not be written truthfully afterwards. And the cookie
   * that logActivity() normally reads is not in place yet at this point, hence
   * the explicit argument.
   */
  await logActivity({
    actorUserId: operator.id,
    actorName: operator.name,
    action: "impersonation.started",
    targetType: "user",
    targetId: targetUserId,
    targetLabel: targetProfile?.fullName ?? targetAuthUser.user.email ?? targetUserId,
    metadata: { targetRole: targetProfile?.role ?? null, via: existing ? caller.id : null },
    impersonator: operator,
  });

  const cookieStore = await cookies();
  cookieStore.set(
    IMPERSONATION_COOKIE,
    JSON.stringify(
      backupToKeep(existing, {
        accessToken: callerSession.access_token,
        refreshToken: callerSession.refresh_token,
        // Carried so logActivity() can name the real operator on every action
        // taken during this session. See lib/impersonation.ts.
        impersonatorId: caller.id,
        impersonatorName: callerProfile.fullName ?? "Unknown",
      }),
    ),
    { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  );

  await supabase.auth.setSession({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
  });

  redirect(await impersonationHomePath(targetUserId, targetProfile?.role ?? "smb_owner"));
}

/** Bound to <form action={stopImpersonationAction}> — the "Return to admin" button. */
export async function stopImpersonationAction() {
  const backup = await readImpersonationSession();
  if (!backup) redirect("/admin");

  // Who we were pretending to be, captured before the session is handed back.
  const supabase = await createClient();
  const {
    data: { user: impersonated },
  } = await supabase.auth.getUser();
  const impersonatedProfile = impersonated
    ? await db.query.profiles.findFirst({ where: eq(profiles.id, impersonated.id) })
    : undefined;

  const { data: restored, error: restoreError } = await supabase.auth.setSession({
    access_token: backup.accessToken,
    refresh_token: backup.refreshToken,
  });

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);

  /*
   * Where "return" goes depends on who is returning. An agency owner who
   * opened a client's dashboard comes back to their agency; only a super
   * admin comes back to /admin. Sending everyone to /admin bounced the agency
   * owner off the role guard and looked like the return had failed. A backup
   * whose tokens no longer work (signed out elsewhere, expired) is a real
   * sign-in again, not a redirect loop.
   */
  const restoredId = restored?.user?.id ?? backup.impersonatorId ?? null;
  const restoredProfile = restoredId
    ? await db.query.profiles.findFirst({ where: eq(profiles.id, restoredId) })
    : undefined;
  const home = restoreError || !restoredProfile ? "/login" : roleHomePath(restoredProfile.role);

  // Explicit impersonator again: the cookie has just been deleted, so cookie
  // detection would report this as an ordinary action by the admin — which
  // would lose the fact that it closes an impersonation session.
  await logActivity({
    actorUserId: backup.impersonatorId ?? null,
    actorName: backup.impersonatorName ?? "Unknown administrator",
    action: "impersonation.stopped",
    targetType: "user",
    targetId: impersonated?.id ?? null,
    targetLabel: impersonatedProfile?.fullName ?? impersonated?.email ?? "Unknown user",
    impersonator: {
      id: backup.impersonatorId ?? null,
      name: backup.impersonatorName ?? "Unknown administrator",
    },
  });

  redirect(home);
}
