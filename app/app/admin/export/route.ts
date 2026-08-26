import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { agencies, sites } from "@/lib/db/schema";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  });
  if (profile?.role !== "super_admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const agencyRows = await db
    .select({
      name: agencies.name,
      plan: agencies.plan,
      createdAt: agencies.createdAt,
      siteCount: sql<number>`count(${sites.id})::int`,
    })
    .from(agencies)
    .leftJoin(sites, sql`${sites.agencyId} = ${agencies.id}`)
    .groupBy(agencies.id)
    .orderBy(desc(agencies.createdAt));

  const csv = toCsv([
    ["Agency", "Plan", "Sites", "Joined"],
    ...agencyRows.map((a) => [
      a.name,
      a.plan,
      String(a.siteCount),
      a.createdAt.toISOString().slice(0, 10),
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="vibewp-agencies-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
