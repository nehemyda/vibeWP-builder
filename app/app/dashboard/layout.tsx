import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * A way back for anyone whose home is not this dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A LAYOUT AND NOT A PROP
 *
 * Agencies can now open a managed site's dashboard directly. That is not
 * impersonation, so the "Viewing as…" bar never appeared — and every route
 * under here became a dead end with no link out. Threading a prop would mean
 * touching all five views and remembering the sixth, so the bar lives where it
 * cannot be forgotten: above every dashboard route at once.
 *
 * Renders nothing for an SMB, whose home this genuinely is.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let backHref: string | null = null;
  if (user) {
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
    if (profile?.role === "agency_owner" || profile?.role === "agency_member") {
      const agency =
        profile.role === "agency_owner"
          ? await db.query.agencies.findFirst({ where: eq(agencies.ownerUserId, user.id) })
          : await (async () => {
              const m = await db.query.agencyMembers.findFirst({
                where: eq(agencyMembers.userId, user.id),
              });
              return m ? db.query.agencies.findFirst({ where: eq(agencies.id, m.agencyId) }) : undefined;
            })();
      backHref = agency?.partnerId ? `/agency/${agency.partnerId}` : "/agency";
    } else if (profile?.role === "super_admin") {
      backHref = "/admin";
    }
  }

  return (
    <>
      {backHref && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.9rem",
            padding: "0.6rem 1rem",
            background: "#12151c",
            color: "#fff",
            fontSize: "0.88rem",
          }}
        >
          <span>You&rsquo;re managing this site</span>
          <Link
            href={backHref}
            style={{
              padding: "0.3rem 0.8rem",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.35)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Back
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
