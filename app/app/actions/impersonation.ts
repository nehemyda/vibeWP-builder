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
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

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

  const cookieStore = await cookies();
  cookieStore.set(
    IMPERSONATION_COOKIE,
    JSON.stringify({
      accessToken: callerSession.access_token,
      refreshToken: callerSession.refresh_token,
    }),
    { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  );

  await supabase.auth.setSession({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
  });

  const targetProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, targetUserId),
  });
  redirect(await impersonationHomePath(targetUserId, targetProfile?.role ?? "smb_owner"));
}

/** Bound to <form action={stopImpersonationAction}> — the "Return to admin" button. */
export async function stopImpersonationAction() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) redirect("/admin");

  const backup = JSON.parse(raw) as { accessToken: string; refreshToken: string };
  const supabase = await createClient();
  await supabase.auth.setSession({
    access_token: backup.accessToken,
    refresh_token: backup.refreshToken,
  });

  cookieStore.delete(IMPERSONATION_COOKIE);
  redirect("/admin");
}
