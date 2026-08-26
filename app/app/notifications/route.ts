import { NextResponse } from "next/server";
import { eq, or, and, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers, sites, leads, activityLog } from "@/lib/db/schema";
import { ACTION_LABEL } from "@/components/dashboard/ActivityFeed";

type NotificationItem = { id: string; text: string; createdAt: string };

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  if (!profile) return NextResponse.json({ items: [] }, { status: 401 });

  let items: NotificationItem[] = [];

  if (profile.role === "super_admin") {
    const rows = await db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(8);
    items = rows.map((r) => ({
      id: r.id,
      text: `${r.actorName} ${ACTION_LABEL[r.action] ?? r.action}${r.targetLabel ? ` — ${r.targetLabel}` : ""}`,
      createdAt: r.createdAt.toISOString(),
    }));
  } else if (profile.role === "agency_owner" || profile.role === "agency_member") {
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

    if (agency) {
      const rows = await db
        .select()
        .from(activityLog)
        .where(
          or(
            eq(activityLog.actorUserId, user.id),
            and(eq(activityLog.targetType, "agency"), eq(activityLog.targetId, agency.id)),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(8);
      items = rows.map((r) => ({
        id: r.id,
        text: `${r.actorName} ${ACTION_LABEL[r.action] ?? r.action}${r.targetLabel ? ` — ${r.targetLabel}` : ""}`,
        createdAt: r.createdAt.toISOString(),
      }));
    }
  } else {
    const site = await db.query.sites.findFirst({
      where: eq(sites.ownerUserId, user.id),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    if (site) {
      const rows = await db
        .select()
        .from(leads)
        .where(eq(leads.siteId, site.id))
        .orderBy(desc(leads.receivedAt))
        .limit(8);
      items = rows.map((r) => ({
        id: r.id,
        text: `New lead from ${r.name}`,
        createdAt: r.receivedAt.toISOString(),
      }));
    }
  }

  return NextResponse.json({ items });
}
