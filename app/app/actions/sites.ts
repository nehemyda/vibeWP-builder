"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies, agencyMembers, sites, sitePages } from "@/lib/db/schema";
import { roleHomePath } from "@/lib/role-redirect";
import { generateSmbId } from "@/lib/ids";
import { logActivity } from "@/lib/activity";

export async function canEditSite(userId: string, siteId: string) {
  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  if (actor?.role === "super_admin") return true;

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return false;
  if (site.ownerUserId === userId) return true;
  if (!site.agencyId) return false;

  const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, site.agencyId) });
  if (agency?.ownerUserId === userId) return true;

  const membership = await db.query.agencyMembers.findFirst({
    where: eq(agencyMembers.userId, userId),
  });
  return membership?.agencyId === site.agencyId;
}

function deriveSiteName(prompt: string): string {
  const trimmed = prompt.trim();
  const match = trimmed.match(/for (?:my |a |an )?(.+)$/i);
  const base = (match ? match[1] : trimmed).replace(/[.?!]+$/, "").trim();
  const words = base.split(/\s+/).slice(0, 6).join(" ");
  if (!words) return "Untitled site";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function resolveOwnership(userId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });

  if (profile?.role === "agency_owner") {
    const agency = await db.query.agencies.findFirst({
      where: eq(agencies.ownerUserId, userId),
    });
    return { ownerType: "agency" as const, agencyId: agency?.id ?? null, role: profile.role };
  }

  if (profile?.role === "agency_member") {
    const membership = await db.query.agencyMembers.findFirst({
      where: eq(agencyMembers.userId, userId),
    });
    return {
      ownerType: "agency" as const,
      agencyId: membership?.agencyId ?? null,
      role: profile.role,
    };
  }

  return { ownerType: "smb" as const, agencyId: null, role: profile?.role ?? "smb_owner" };
}

/**
 * Creates a draft site for an already-authenticated user and returns the
 * builder path to send them to.
 *
 * Deliberately does NOT call redirect() itself — next/navigation's
 * redirect() throws a special NEXT_REDIRECT signal that only Next's own
 * form-action/router plumbing knows how to intercept. A caller that invokes
 * a server action as a plain async function (e.g. from a client
 * onSubmit handler) and wraps it in try/catch — as the login/register forms
 * do, to surface real errors — will catch that signal too and treat it as a
 * failure. Returning a path and letting the caller decide how to navigate
 * avoids the ambiguity entirely.
 */
async function createDraftSite(userId: string, prompt: string): Promise<string> {
  const { ownerType, agencyId } = await resolveOwnership(userId);
  const smbId = await generateSmbId();

  const [site] = await db
    .insert(sites)
    .values({
      smbId,
      ownerType,
      agencyId,
      ownerUserId: userId,
      name: deriveSiteName(prompt),
      status: "draft",
    })
    .returning();

  await db.insert(sitePages).values({
    siteId: site.id,
    slug: "home",
    schemaJson: { schemaVersion: "1.0", nodes: [] },
  });

  if (agencyId) {
    const agency = await db.query.agencies.findFirst({ where: eq(agencies.id, agencyId) });
    if (agency?.partnerId) {
      return `/builder/${agency.partnerId}/${smbId}?prompt=${encodeURIComponent(prompt)}&autostart=1`;
    }
  }

  return `/builder/${smbId}?prompt=${encodeURIComponent(prompt)}&autostart=1`;
}

/**
 * The landing page's prompt box posts here directly via <form action={...}>.
 * redirect() is safe to call here — this is the one context (a real form
 * action, not a plain function call wrapped in try/catch) where Next's
 * framework plumbing is guaranteed to intercept it and navigate.
 */
export async function startBuildingAction(formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/register?prompt=${encodeURIComponent(prompt)}`);
  }

  redirect(await createDraftSite(user.id, prompt));
}

/** For imperative (non-form-action) callers post-signup/login: returns where to send the user. */
export async function resolveNextPath(userId: string, prompt: string | null): Promise<string> {
  if (prompt) return createDraftSite(userId, prompt);

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });
  return roleHomePath(profile?.role ?? "smb_owner");
}

/** Persists the mock-AI-generated homepage schema for a site the caller must already own. */
export async function saveGeneratedSchema(
  siteId: string,
  schema: Record<string, unknown>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }

  const existing = await db.query.sitePages.findFirst({
    where: eq(sitePages.siteId, siteId),
  });

  if (existing) {
    await db
      .update(sitePages)
      .set({ schemaJson: schema })
      .where(eq(sitePages.id, existing.id));
  } else {
    await db.insert(sitePages).values({ siteId, slug: "home", schemaJson: schema });
  }

  await db.update(sites).set({ lastEditedAt: new Date() }).where(eq(sites.id, siteId));
}

/** Bound to <form action={updateSiteSettingsAction}> — a real form action, used from several site-editing panels. */
export async function updateSiteSettingsAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const siteId = String(formData.get("siteId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");
  if (!siteId || !name) redirect(redirectTo);

  if (!(await canEditSite(user.id, siteId))) redirect("/dashboard");

  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  await db
    .update(sites)
    .set({ name, domain: domain || null })
    .where(eq(sites.id, siteId));
  await logActivity({
    actorUserId: user.id,
    actorName: actor?.fullName ?? "Unknown",
    action: "site.edited",
    targetType: "site",
    targetId: siteId,
    targetLabel: name,
  });

  redirect(`${redirectTo}?saved=1`);
}

/**
 * Bound via deleteSiteAction.bind(null, siteId, redirectTo). Soft delete —
 * hides the site from listings and blocks the builder for it, but keeps its
 * leads, pages, and business profile intact and recoverable.
 */
export async function deleteSiteAction(siteId: string, redirectTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await canEditSite(user.id, siteId))) redirect("/dashboard");

  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  await db.update(sites).set({ deletedAt: new Date() }).where(eq(sites.id, siteId));
  await logActivity({
    actorUserId: user.id,
    actorName: actor?.fullName ?? "Unknown",
    action: "site.deleted",
    targetType: "site",
    targetId: siteId,
    targetLabel: site?.name ?? null,
  });

  redirect(redirectTo);
}
