"use server";

import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, agencyPlanPrices, plans } from "@/lib/db/schema";
import { requireAgency } from "@/lib/auth/require-agency";
import { parseDollarsToCents, planKeyOf } from "@/lib/billing";
import { logActivity } from "@/lib/activity";

/**
 * Pricing is money, so it's owner-only — an agency_member can see the
 * billing page but can't change what clients are charged.
 */
async function requireAgencyBillingOwner() {
  const { profile, agency, role } = await requireAgency();
  if (!agency) redirect("/agency");

  const billingPath = `/agency/${agency.partnerId}/billing`;
  if (role !== "agency_owner") redirect(billingPath);

  return { profile, agency, billingPath };
}

/**
 * Bound to <form action={updateAgencyPlanPricesAction}> on the agency
 * billing page — saves the whole price list at once, one field per plan
 * key. A blank field clears that plan's override so the platform list
 * price applies again.
 */
export async function updateAgencyPlanPricesAction(formData: FormData) {
  const { profile: actor, agency, billingPath } = await requireAgencyBillingOwner();

  const planRows = await db.select().from(plans);

  for (const plan of planRows) {
    // Fields are named price_<planKey>; a plan with no field in this
    // submission is left exactly as it is.
    if (!formData.has(`price_${plan.key}`)) continue;

    const cents = parseDollarsToCents(formData.get(`price_${plan.key}`));

    if (cents === null) {
      await db
        .delete(agencyPlanPrices)
        .where(
          and(eq(agencyPlanPrices.agencyId, agency.id), eq(agencyPlanPrices.planKey, plan.key)),
        );
      continue;
    }

    await db
      .insert(agencyPlanPrices)
      .values({ agencyId: agency.id, planKey: plan.key, priceMonthlyCents: cents })
      .onConflictDoUpdate({
        target: [agencyPlanPrices.agencyId, agencyPlanPrices.planKey],
        set: { priceMonthlyCents: cents, updatedAt: new Date() },
      });
  }

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "billing.client_prices_updated",
    targetType: "agency",
    targetId: agency.id,
    targetLabel: agency.name,
  });

  redirect(`${billingPath}?saved=1`);
}

/**
 * Bound per row to <form action={updateSitePriceOverrideAction}> — sets or
 * clears one client's custom monthly price.
 */
export async function updateSitePriceOverrideAction(formData: FormData) {
  const { profile: actor, agency, billingPath } = await requireAgencyBillingOwner();

  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) redirect(billingPath);

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site || site.agencyId !== agency.id) redirect(billingPath);

  const cents = parseDollarsToCents(formData.get("price"));

  await db
    .update(sites)
    .set({ customPriceMonthlyCents: cents })
    .where(eq(sites.id, siteId));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: cents === null ? "billing.client_price_cleared" : "billing.client_price_set",
    targetType: "site",
    targetId: site.id,
    targetLabel: site.name,
    metadata: { planKey: planKeyOf(site.plan), priceMonthlyCents: cents },
  });

  redirect(`${billingPath}?saved=1`);
}
