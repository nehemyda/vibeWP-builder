"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, agencies, siteTransfers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/require-role";
import { resolveAdminSitePath } from "@/lib/site-paths";
import { logActivity } from "@/lib/activity";

/**
 * Moves a site to a different agency (or to no agency at all).
 *
 * ── What deliberately does NOT change ──────────────────────────────────
 * The SMB ID identifies the client permanently, so it is never reissued —
 * which also means the client's dashboard keeps working and their existing
 * links stay valid. The owner account, site team members, pages, leads and
 * business profile are all keyed to the site rather than the agency, so
 * they follow the client automatically.
 *
 * URLs need no migration either: every path is derived from the site's
 * CURRENT agency at request time via resolveSitePaths(), and no Partner ID
 * is stored on the site row. Stale links redirect-correct themselves.
 *
 * ── What must NOT survive ──────────────────────────────────────────────
 * The per-site price override. It was a private arrangement between the
 * client and their previous agency; letting it persist would silently bind
 * an agency to a rate it never agreed to. It is cleared here and preserved
 * in the transfer record instead.
 *
 * Bound via transferSiteAction.bind(null, siteId) on the admin site detail
 * page. Super admin only — an agency must not be able to hand a client to
 * someone else, nor help itself to one.
 */
export async function transferSiteAction(siteId: string, formData: FormData) {
  const { user, profile: actor } = await requireRole(["super_admin"]);

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) redirect("/admin/agencies");

  const backPath = `/admin/sites/${site.smbId}`;

  // A deleted site has no business changing hands — restore it first.
  if (site.deletedAt) {
    redirect(`${backPath}?error=${encodeURIComponent("Restore this site before transferring it.")}`);
  }

  const rawTarget = String(formData.get("toAgencyId") ?? "").trim();
  // An empty selection means "no agency" — the client becomes directly owned.
  const toAgencyId = rawTarget === "" || rawTarget === "none" ? null : rawTarget;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (toAgencyId === site.agencyId) {
    redirect(`${backPath}?error=${encodeURIComponent("That is already the managing agency.")}`);
  }

  if (toAgencyId) {
    const target = await db.query.agencies.findFirst({ where: eq(agencies.id, toAgencyId) });
    if (!target) {
      redirect(`${backPath}?error=${encodeURIComponent("Destination agency not found.")}`);
    }
    // Handing a client to a suspended or archived agency would lock them out.
    if (target.status !== "active") {
      redirect(
        `${backPath}?error=${encodeURIComponent(`${target.name} is ${target.status} — reactivate it before transferring clients to it.`)}`,
      );
    }
  }

  const fromAgency = site.agencyId
    ? await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) })
    : null;
  const toAgency = toAgencyId
    ? await db.query.agencies.findFirst({ where: eq(agencies.id, toAgencyId) })
    : null;

  const previousCustomPrice = site.customPriceMonthlyCents;

  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({
        agencyId: toAgencyId,
        // ownerType tracks whether an agency manages this site at all.
        ownerType: toAgencyId ? "agency" : "smb",
        // The old agency's negotiated rate must not bind the new one.
        customPriceMonthlyCents: null,
      })
      .where(eq(sites.id, site.id));

    await tx.insert(siteTransfers).values({
      siteId: site.id,
      fromAgencyId: site.agencyId,
      toAgencyId,
      transferredByUserId: user.id,
      previousCustomPriceMonthlyCents: previousCustomPrice,
      note,
    });
  });

  await logActivity({
    actorUserId: user.id,
    actorName: actor.fullName,
    action: "site.transferred",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: {
      from: fromAgency?.partnerId ?? null,
      to: toAgency?.partnerId ?? null,
      clearedCustomPriceMonthlyCents: previousCustomPrice,
    },
  });

  // Straight to where the client lives now. Going via backPath would bounce
  // through a second redirect, which drops the query string and swallows the
  // confirmation message.
  redirect(`${await resolveAdminSitePath({ smbId: site.smbId, agencyId: toAgencyId })}?transferred=1`);
}
