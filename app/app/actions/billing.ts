"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";

/** Bound to <form action={updatePlanAction}> per plan card on /admin/billing. */
export async function updatePlanAction(formData: FormData) {
  const { profile: actor } = await requirePermission("billing.manage");

  const planId = String(formData.get("planId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const priceDollars = Number(formData.get("priceMonthly") ?? 0);
  const siteLimitRaw = String(formData.get("siteLimit") ?? "").trim();
  const seatLimitRaw = String(formData.get("seatLimit") ?? "").trim();
  const featuresRaw = String(formData.get("features") ?? "");
  const isActive = formData.get("isActive") === "on";
  if (!planId || !name) redirect("/admin/billing");

  const features = featuresRaw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  await db
    .update(plans)
    .set({
      name,
      priceMonthlyCents: Math.max(0, Math.round(priceDollars * 100)),
      siteLimit: siteLimitRaw ? Number(siteLimitRaw) : null,
      seatLimit: seatLimitRaw ? Number(seatLimitRaw) : null,
      features,
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "plan.edited",
    targetType: "plan",
    targetId: planId,
    targetLabel: name,
  });

  redirect("/admin/billing?saved=1");
}

/** Bound to <form action={createPlanAction}> on /admin/billing. */
export async function createPlanAction(formData: FormData) {
  const { profile: actor } = await requirePermission("billing.manage");

  const key = String(formData.get("key") ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const name = String(formData.get("name") ?? "").trim();
  if (!key || !name) redirect("/admin/billing");

  const [plan] = await db.insert(plans).values({ key, name, sortOrder: 999 }).returning();

  await logActivity({
    actorUserId: actor.id,
    actorName: actor.fullName,
    action: "plan.created",
    targetType: "plan",
    targetId: plan.id,
    targetLabel: name,
  });

  redirect("/admin/billing?saved=1");
}
