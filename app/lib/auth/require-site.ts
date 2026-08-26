import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, siteMembers } from "@/lib/db/schema";
import { requireRole } from "./require-role";

/** The current smb_owner's or smb_member's site, alongside the usual role guard. */
export async function requireSmbSite() {
  const { user, profile, role } = await requireRole(["smb_owner", "smb_member"]);

  const site =
    role === "smb_owner"
      ? await db.query.sites.findFirst({
          where: and(eq(sites.ownerUserId, user.id), isNull(sites.deletedAt)),
          orderBy: [desc(sites.createdAt)],
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

  return { user, profile, role, site };
}
