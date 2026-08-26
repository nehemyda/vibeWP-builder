import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, agencyMembers } from "@/lib/db/schema";
import { requireRole } from "./require-role";

/** Resolves the current user's agency, alongside the usual role guard. */
export async function requireAgency() {
  const { user, profile, role } = await requireRole(["agency_owner", "agency_member"]);

  const agency =
    role === "agency_owner"
      ? await db.query.agencies.findFirst({ where: eq(agencies.ownerUserId, user.id) })
      : await (async () => {
          const membership = await db.query.agencyMembers.findFirst({
            where: eq(agencyMembers.userId, user.id),
          });
          return membership
            ? db.query.agencies.findFirst({ where: eq(agencies.id, membership.agencyId) })
            : undefined;
        })();

  return { user, profile, role, agency };
}
