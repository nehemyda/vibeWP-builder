import { NextResponse } from "next/server";
import { ilike, or, and, ne, isNull, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies, sites } from "@/lib/db/schema";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  });
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ results: [] }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = `%${q}%`;

  const agencyMatches = await db
    .select({ id: agencies.id, name: agencies.name, partnerId: agencies.partnerId })
    .from(agencies)
    .where(
      and(ne(agencies.status, "deleted"), or(ilike(agencies.name, like), ilike(agencies.partnerId, like))),
    )
    .limit(5);

  const siteMatches = await db
    .select({
      id: sites.id,
      name: sites.name,
      smbId: sites.smbId,
      agencyPartnerId: agencies.partnerId,
      ownerName: profiles.fullName,
    })
    .from(sites)
    .leftJoin(profiles, sql`${profiles.id} = ${sites.ownerUserId}`)
    .leftJoin(agencies, sql`${agencies.id} = ${sites.agencyId}`)
    .where(and(isNull(sites.deletedAt), or(ilike(sites.name, like), ilike(sites.smbId, like))))
    .limit(5);

  const results = [
    ...agencyMatches.map((a) => ({
      type: "agency" as const,
      id: a.id,
      label: a.name,
      sublabel: a.partnerId ?? "",
      href: `/admin/agencies/${a.partnerId}`,
    })),
    ...siteMatches.map((s) => ({
      type: "site" as const,
      id: s.id,
      label: s.name,
      sublabel: s.smbId ?? "",
      href: s.agencyPartnerId
        ? `/admin/agencies/${s.agencyPartnerId}/sites/${s.smbId}`
        : `/admin/sites/${s.smbId}`,
    })),
  ];

  return NextResponse.json({ results });
}
