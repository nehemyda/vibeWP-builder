import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers } from "@/lib/db/schema";
import { roleHomePath } from "@/lib/role-redirect";

type Role = (typeof profiles.$inferSelect)["role"];

/** Blocks login for anyone attached to a suspended/archived/deleted agency. */
async function callerAgencyIsLocked(userId: string, role: Role): Promise<boolean> {
  if (role !== "agency_owner" && role !== "agency_member") return false;

  const agency =
    role === "agency_owner"
      ? await db.query.agencies.findFirst({ where: eq(agencies.ownerUserId, userId) })
      : await (async () => {
          const membership = await db.query.agencyMembers.findFirst({
            where: eq(agencyMembers.userId, userId),
          });
          return membership
            ? db.query.agencies.findFirst({ where: eq(agencies.id, membership.agencyId) })
            : undefined;
        })();

  return !!agency && agency.status !== "active";
}

/**
 * Server-side page guard: redirects to /login if unauthenticated, or to the
 * user's own dashboard if their role doesn't match this page.
 */
export async function requireRole(allowed: Role[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
  });

  if (profile && !profile.active) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  const role = profile?.role ?? "smb_owner";

  if (await callerAgencyIsLocked(user.id, role)) {
    await supabase.auth.signOut();
    redirect("/login?locked=1");
  }

  if (!allowed.includes(role)) {
    redirect(roleHomePath(role));
  }

  return { user, profile: profile!, role };
}
