import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, agencies, agencyMembers } from "@/lib/db/schema";
import { roleHomePath } from "@/lib/role-redirect";

/** Confirms the current user owns (or their agency owns) the given site, looked up by its SMB ID. */
export async function requireSiteAccess(smbId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const site = await db.query.sites.findFirst({ where: eq(sites.smbId, smbId) });
  if (!site) notFound();

  if (site.ownerUserId === user.id) return { user, site };

  if (site.agencyId) {
    const ownsAgency = await db.query.agencies.findFirst({
      where: eq(agencies.id, site.agencyId),
    });
    if (ownsAgency?.ownerUserId === user.id) return { user, site };

    const isMember = await db.query.agencyMembers.findFirst({
      where: eq(agencyMembers.userId, user.id),
    });
    if (isMember?.agencyId === site.agencyId) return { user, site };
  }

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  });
  redirect(roleHomePath(profile?.role ?? "smb_owner"));
}
