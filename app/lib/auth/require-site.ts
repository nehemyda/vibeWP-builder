import { eq, and, isNull, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sites, siteMembers, agencies, agencyMembers } from "@/lib/db/schema";
import { requireRole } from "./require-role";

/**
 * The site a dashboard request is about, and who is allowed to see it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO WAYS IN, AND THEY ARE NOT SYMMETRICAL
 *
 * An SMB owner or member gets THEIR site — no id needed, and no id accepted,
 * so nothing they can type widens what they see.
 *
 * An agency may open a dashboard for a site it manages, which is why this now
 * takes an smbId. That path is the dangerous one: it is the only place a
 * request names a site belonging to someone else. It is therefore written to
 * fail closed —
 *
 *   - the agency is resolved from the SESSION, never from the URL;
 *   - `agencyId` is part of the WHERE clause, not a check performed after
 *     loading the row, so a site belonging to another agency simply does not
 *     match rather than being loaded and then judged;
 *   - a missing agency, missing id, or no match all return no site, which
 *     callers render as "not found" — never as somebody else's dashboard.
 *
 * There are no row-level security policies behind this. That WHERE clause is
 * the entire boundary between one agency's clients and another's.
 */
export async function requireSmbSite(smbId?: string) {
  const { user, profile, role } = await requireRole([
    "smb_owner",
    "smb_member",
    "agency_owner",
    "agency_member",
  ]);

  if (role === "agency_owner" || role === "agency_member") {
    /*
     * Bare /dashboard is not an agency's home. Without this they would land on
     * the "you don't have a site yet" empty state instead of their own screen.
     */
    if (!smbId) redirect("/agency");

    const agency =
      role === "agency_owner"
        ? await db.query.agencies.findFirst({ where: eq(agencies.ownerUserId, user.id) })
        : await (async () => {
            const m = await db.query.agencyMembers.findFirst({
              where: eq(agencyMembers.userId, user.id),
            });
            return m
              ? db.query.agencies.findFirst({ where: eq(agencies.id, m.agencyId) })
              : undefined;
          })();

    if (!agency) return { user, profile, role, site: undefined };

    const site = await db.query.sites.findFirst({
      where: and(
        eq(sites.smbId, smbId),
        // The line that keeps agencies apart.
        eq(sites.agencyId, agency.id),
        isNull(sites.deletedAt),
      ),
    });

    return { user, profile, role, site };
  }

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
